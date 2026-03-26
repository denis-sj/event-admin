import { z } from "zod";

export const scoreInputSchema = z.object({
  criterionId: z.string().uuid(),
  value: z.number().int().min(0),
});

export const saveScoresSchema = z.object({
  scores: z.array(scoreInputSchema).min(1),
  comment: z.string().max(5000).nullable().default(null),
});

export const confirmEvaluationSchema = z.object({
  teamId: z.string().uuid(),
});
