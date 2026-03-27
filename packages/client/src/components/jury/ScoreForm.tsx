import { useState, useEffect, useCallback, useRef } from 'react';
import type { JuryTeam, JuryCriterion } from '../../stores/jury.store';
import { Button } from '../ui';

interface ScoreFormProps {
  team: JuryTeam;
  criteria: JuryCriterion[];
  isScoringOpen: boolean;
  onSave: (
    teamId: string,
    scores: Array<{ criterionId: string; value: number }>,
    comment: string | null,
  ) => Promise<void>;
  onConfirm: (teamId: string) => Promise<void>;
  onBack: () => void;
}

export function ScoreForm({
  team,
  criteria,
  isScoringOpen,
  onSave,
  onConfirm,
  onBack,
}: ScoreFormProps) {
  // Initialize scores from existing evaluation
  const [scores, setScores] = useState<Record<string, number | ''>>(() => {
    const initial: Record<string, number | ''> = {};
    for (const c of criteria) {
      const existing = team.evaluation?.scores.find(
        (s) => s.criterionId === c.id,
      );
      initial[c.id] = existing ? existing.value : '';
    }
    return initial;
  });
  const [comment, setComment] = useState(team.evaluation?.comment || '');
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>('');
  const isConfirmed = team.evaluation?.status === 'CONFIRMED';
  // Inputs are read-only only when scoring is not open for this team.
  // Confirmed evaluations remain editable while scoring is open — the server
  // supports re-saving a confirmed evaluation (returns it to DRAFT).
  const isReadOnly = !isScoringOpen;

  // Compute total (round to 1 decimal to avoid floating-point artifacts)
  const total = Math.round(
    Object.values(scores).reduce<number>(
      (sum, val) => sum + (typeof val === 'number' ? val : 0),
      0,
    ) * 10,
  ) / 10;

  const maxTotal = criteria.reduce((sum, c) => sum + c.maxScore, 0);

  // Check if all criteria are filled
  const allFilled = criteria.every(
    (c) => typeof scores[c.id] === 'number' && scores[c.id] !== '',
  );

  // Serialize current state for change detection
  const serializeState = useCallback(() => {
    return JSON.stringify({ scores, comment: comment || null });
  }, [scores, comment]);

  // Auto-save with debounce (only when scoring is open and not confirmed)
  useEffect(() => {
    if (isReadOnly) return;

    const currentState = serializeState();
    if (currentState === lastSavedRef.current) return;

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = setTimeout(async () => {
      const validScores = Object.entries(scores)
        .filter(([, v]) => typeof v === 'number' && v !== '')
        .map(([criterionId, value]) => ({
          criterionId,
          value: value as number,
        }));

      if (validScores.length === 0) return;

      await onSave(team.id, validScores, comment || null);
      lastSavedRef.current = currentState;
    }, 1500);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [scores, comment, team.id, onSave, serializeState, isReadOnly]);

  // Sync with team evaluation changes (from WS)
  useEffect(() => {
    if (team.evaluation) {
      const newScores: Record<string, number | ''> = {};
      for (const c of criteria) {
        const existing = team.evaluation.scores.find(
          (s) => s.criterionId === c.id,
        );
        newScores[c.id] = existing ? existing.value : '';
      }
      // Only update if we don't have local changes pending
      const currentSerialized = serializeState();
      if (lastSavedRef.current === '' || currentSerialized === lastSavedRef.current) {
        setScores(newScores);
        setComment(team.evaluation.comment || '');
        lastSavedRef.current = JSON.stringify({
          scores: newScores,
          comment: team.evaluation.comment || null,
        });
      }
    }
  }, [team.evaluation?.id, team.evaluation?.status]);

  // Commit the current slider position when the user first interacts with an unset criterion.
  // This handles the case where the thumb is already at 0 and onChange won't fire.
  // Only triggers on deliberate interaction: pointer down or slider-relevant key presses.
  // Passive focus (Tab navigation) does NOT commit a score.
  const SLIDER_COMMIT_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']);

  const handleSliderInteract = (criterionId: string, currentValue: string) => {
    if (isReadOnly) return;
    if (scores[criterionId] !== '') return; // already set
    handleScoreChange(criterionId, currentValue);
  };

  const handleSliderKeyDown = (criterionId: string, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (SLIDER_COMMIT_KEYS.has(e.key)) {
      handleSliderInteract(criterionId, e.currentTarget.value);
    }
  };

  const handleScoreChange = (criterionId: string, value: string) => {
    if (isReadOnly) return;

    if (value === '') {
      setScores((prev) => ({ ...prev, [criterionId]: '' }));
      return;
    }

    const num = parseFloat(value);
    if (isNaN(num)) return;

    const criterion = criteria.find((c) => c.id === criterionId);
    if (!criterion) return;

    const clamped = Math.min(Math.max(0, num), criterion.maxScore);
    // Round to 1 decimal place to avoid floating-point artifacts
    const rounded = Math.round(clamped * 10) / 10;
    setScores((prev) => ({ ...prev, [criterionId]: rounded }));
  };

  const handleSaveNow = async () => {
    const validScores = Object.entries(scores)
      .filter(([, v]) => typeof v === 'number' && v !== '')
      .map(([criterionId, value]) => ({
        criterionId,
        value: value as number,
      }));

    if (validScores.length === 0) return;

    setSaving(true);
    await onSave(team.id, validScores, comment || null);
    lastSavedRef.current = serializeState();
    setSaving(false);
  };

  const handleConfirm = async () => {
    // Save first
    await handleSaveNow();
    setConfirming(true);
    await onConfirm(team.id);
    setConfirming(false);
  };

  return (
    <div>
      {/* Back button and team name */}
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 active:bg-gray-50"
          aria-label="Back"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold text-gray-900">
            {team.name}
          </h2>
          {team.task && (
            <p className="truncate text-sm text-gray-500">
              {team.task.title}
            </p>
          )}
        </div>
        {isConfirmed && (
          <span className="flex-shrink-0 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
            Confirmed
          </span>
        )}
      </div>

      {/* Scoring status */}
      {!isScoringOpen && (
        <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3">
          <p className="text-sm text-yellow-800">
            {isConfirmed
              ? 'This evaluation has been confirmed. Scores are locked until the organizer re-opens scoring.'
              : 'Scoring is not open for this team. Scores are read-only until the organizer opens scoring.'}
          </p>
        </div>
      )}

      {/* Criteria score inputs */}
      <div className="space-y-3">
        {criteria.map((criterion) => (
          <div
            key={criterion.id}
            className="rounded-lg border border-gray-200 bg-white px-4 py-3"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900">
                  {criterion.name}
                </p>
                {criterion.description && (
                  <p className="mt-0.5 text-xs text-gray-500">
                    {criterion.description}
                  </p>
                )}
              </div>
              <div className="flex flex-shrink-0 items-center gap-1.5">
                <span className="min-w-[3.5rem] text-right text-lg font-semibold text-gray-900">
                  {scores[criterion.id] === '' ? '—' : (scores[criterion.id] as number).toFixed(1)}
                </span>
                <span className="text-sm text-gray-400">
                  / {criterion.maxScore}
                </span>
              </div>
            </div>
            <div className="mt-2">
              <input
                type="range"
                min={0}
                max={criterion.maxScore}
                step={0.1}
                value={scores[criterion.id] === '' ? 0 : scores[criterion.id]}
                onChange={(e) =>
                  handleScoreChange(criterion.id, e.target.value)
                }
                onPointerDown={(e) =>
                  handleSliderInteract(criterion.id, (e.target as HTMLInputElement).value)
                }
                onKeyDown={(e) =>
                  handleSliderKeyDown(criterion.id, e)
                }
                disabled={isReadOnly}
                className={`score-slider w-full${scores[criterion.id] === '' ? ' score-slider--unset' : ''}`}
              />
              <div className="mt-0.5 flex justify-between text-xs text-gray-400">
                <span>0</span>
                <span>{criterion.maxScore}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Total score */}
      <div className="mt-4 rounded-lg bg-gray-900 px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-300">Total</span>
          <span className="text-2xl font-bold text-white">
            {total.toFixed(1)}{' '}
            <span className="text-base font-normal text-gray-400">
              / {maxTotal}
            </span>
          </span>
        </div>
      </div>

      {/* Comment */}
      <div className="mt-4">
        <label className="block text-sm font-medium text-gray-700">
          Comment (optional)
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          disabled={isReadOnly}
          rows={3}
          maxLength={5000}
          className="mt-1 block w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 disabled:bg-gray-100 disabled:text-gray-500"
          placeholder="Add a comment about this team..."
        />
      </div>

      {/* Actions */}
      <div className="mt-6 space-y-3">
        {isScoringOpen && (
          <>
            <Button
              onClick={handleConfirm}
              disabled={!allFilled || confirming}
              loading={confirming}
              size="lg"
              className="w-full"
            >
              {isConfirmed ? 'Re-confirm evaluation' : 'Confirm evaluation'}
            </Button>

            <Button
              onClick={handleSaveNow}
              variant="secondary"
              loading={saving}
              size="lg"
              className="w-full"
            >
              Save draft
            </Button>
          </>
        )}

        <p className="text-center text-xs text-gray-400">
          {isConfirmed && isScoringOpen
            ? 'Confirmed — you can still edit and re-confirm while scoring is open'
            : isConfirmed && !isScoringOpen
              ? 'This evaluation has been confirmed'
              : isScoringOpen
                ? 'Scores auto-save as you type'
                : 'Scoring is closed for this team'}
        </p>
      </div>
    </div>
  );
}
