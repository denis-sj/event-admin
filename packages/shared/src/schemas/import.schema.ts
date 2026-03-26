import { z } from "zod";

export const columnMappingSchema = z.object({
  teamName: z.number().int().min(0),
  participantName: z.number().int().min(0),
  participantEmail: z.number().int().min(0).nullable().default(null),
  projectDescription: z.number().int().min(0).nullable().default(null),
});

// Optional map: imported team name (lowercased) → existing team ID or "new".
// When provided, overrides auto-matching by name for conflict resolution.
// "new" means: force-create a new team even if a name match exists.
export const teamResolutionValueSchema = z.union([
  z.literal('new'),
  z.string().uuid(),
]);
export const teamResolutionsSchema = z.record(z.string(), teamResolutionValueSchema);

export const importApplySchema = z.object({
  fileId: z.string().min(1),
  mapping: columnMappingSchema,
  teamResolutions: teamResolutionsSchema.optional(),
});
