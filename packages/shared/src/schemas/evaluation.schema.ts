import { z } from "zod";

export const scoreInputSchema = z.object({
  criterionId: z.string().uuid(),
  value: z
    .number()
    .min(0)
    .refine((v) => Math.abs(Math.round(v * 10) / 10 - v) < 1e-9, {
      message: "Score must be a multiple of 0.1",
    }),
});

export const saveScoresSchema = z.object({
  scores: z.array(scoreInputSchema).min(1),
  comment: z.string().max(5000).nullable().default(null),
});

export const confirmEvaluationSchema = z.object({
  teamId: z.string().uuid(),
});
