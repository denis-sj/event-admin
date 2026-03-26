import { z } from "zod";

export const createCriterionSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().default(null),
  maxScore: z.number().int().min(1).max(100),
});

export const updateCriterionSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  maxScore: z.number().int().min(1).max(100).optional(),
});

export const reorderCriteriaSchema = z.object({
  criterionIds: z.array(z.string().uuid()),
});
