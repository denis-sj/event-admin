# Investigation: 400 Bad Request on PUT /api/jury/events/:eventId/teams/:teamId/scores

## Bug Summary

When a jury member moves the score slider in the ScoreForm component, auto-save requests to
`PUT /api/jury/events/{eventId}/teams/{teamId}/scores` consistently return **400 Bad Request**.
This happens both when the timer is running and when the user manually adjusts scores.

## Root Cause

The Zod validation schema in `packages/shared/src/schemas/evaluation.schema.ts:5` uses:

```typescript
value: z.number().min(0).multipleOf(0.1)
```

The `.multipleOf(0.1)` check internally uses the JavaScript `%` (modulo) operator:
`value % 0.1 !== 0`. Due to IEEE 754 floating-point representation, **most decimal values
that should be multiples of 0.1 fail this check**.

### Proof

```
0.3 % 0.1 = 0.09999999999999998  // FAIL (should be 0)
0.7 % 0.1 = 0.09999999999999992  // FAIL
1.3 % 0.1 = 0.09999999999999998  // FAIL
2.3 % 0.1 = 0.0999999999999997   // FAIL
5.1 % 0.1 = 0.09999999999999937  // FAIL
5.6 % 0.1 = 0.09999999999999934  // FAIL
7.7 % 0.1 = 0.09999999999999976  // FAIL
```

Out of values 0.0 to 10.0 in steps of 0.1 -- the vast majority fail the Zod `multipleOf(0.1)` validation.
This is a known issue in Zod (https://github.com/colinhacks/zod/issues/3486), not fixed as of Zod v4.

### Request Flow

1. User moves slider in `ScoreForm.tsx` -> `handleScoreChange()` rounds to 1 decimal: `Math.round(val * 10) / 10`
2. After 1.5s debounce, auto-save sends `{ scores: [{criterionId, value: 5.3}], comment }` to server
3. Server middleware `validate(saveScoresValidation)` runs Zod parse on request body
4. Zod `multipleOf(0.1)` check: `5.3 % 0.1 = 0.09999999999999953 !== 0` -> **ZodError thrown**
5. Error handler converts ZodError to 400 with `VALIDATION_ERROR` code

## Affected Components

| Component | File | Lines |
|-----------|------|-------|
| Zod schema | `packages/shared/src/schemas/evaluation.schema.ts` | 3-6 |
| Validation middleware | `packages/server/src/services/evaluation.service.ts` | 22-28 |
| Score form (sender) | `packages/client/src/components/jury/ScoreForm.tsx` | 79-91 |
| Error handler | `packages/server/src/middleware/error-handler.ts` | 21-27 |

## Proposed Solution

**Replace `.multipleOf(0.1)` with a float-tolerant `refine()` check.** Simply removing `multipleOf`
would broaden the API contract to accept arbitrary precisions (e.g. `3.55`, `3.14159`) from any
non-UI client, queued payload, or malformed request. Existing tests in
`packages/shared/src/schemas/schemas.test.ts:418-434` explicitly require that values beyond 0.1
step precision are rejected.

Replace in `packages/shared/src/schemas/evaluation.schema.ts`:

```typescript
// Before:
value: z.number().min(0).multipleOf(0.1),

// After:
value: z.number().min(0).refine(
  (v) => Math.abs(Math.round(v * 10) / 10 - v) < 1e-9,
  { message: "Score must be a multiple of 0.1" }
),
```

This approach:
- Correctly accepts valid tenths (`0.3`, `5.1`, `7.7`) that fail with `multipleOf(0.1)`
- Still rejects higher precision values (`3.55`, `3.14159`) as required by the API contract
- Is immune to IEEE 754 floating-point artifacts

### Existing Tests (should pass unchanged)

- `packages/shared/src/schemas/schemas.test.ts:402-408` - "accepts fractional score with 0.1 step" (3.5)
- `packages/shared/src/schemas/schemas.test.ts:410-416` - "accepts score 7.1"
- `packages/shared/src/schemas/schemas.test.ts:418-424` - "rejects precision beyond 0.1 step (3.55)"
- `packages/shared/src/schemas/schemas.test.ts:427-434` - "rejects precision beyond 0.1 step (3.14159)"

### Regression Tests to Add

- Accept values that currently fail due to floating-point: `0.3`, `5.3`, `7.7`, `9.3`
- Accept integer values: `0`, `5`, `10`
- Reject precision beyond 0.1: `3.55`, `3.14159`, `2.05`

## Implementation Notes

### Changes Made

1. **`packages/shared/src/schemas/evaluation.schema.ts:5`** -- replaced `.multipleOf(0.1)` with `.refine()`:
   ```typescript
   value: z.number().min(0).refine(
     (v) => Math.abs(Math.round(v * 10) / 10 - v) < 1e-9,
     { message: "Score must be a multiple of 0.1" }
   ),
   ```

2. **`packages/shared/src/schemas/schemas.test.ts`** -- added 6 regression tests:
   - `accepts 0.3 (floating-point regression)`
   - `accepts 5.3 (floating-point regression)`
   - `accepts 7.7 (floating-point regression)`
   - `accepts 9.3 (floating-point regression)`
   - `accepts integer 10`
   - `rejects precision beyond 0.1 step (2.05)`

### Test Results

- All 73 tests in `schemas.test.ts` pass (including 4 existing + 6 new scoreInputSchema tests)
- All existing tests for `saveScoresSchema` and `confirmEvaluationSchema` pass unchanged
- 5 unrelated test files fail due to missing Prisma client in worktree (pre-existing infra issue)

## Edge Cases

- **Offline queue**: Pending actions stored while offline will also fail on sync -- same root cause, same fix.
- **Confirmed evaluations**: Re-saving a confirmed evaluation also goes through the same schema.
- **No data loss risk**: The fix is purely validation-side. The database stores `Float` which handles 0.1 steps fine.
- **Non-UI clients**: The `refine()` approach keeps server-side precision enforcement, protecting against arbitrary precision values from API clients.
