import { z } from "zod";

export const eventStatusSchema = z.enum([
  "DRAFT",
  "ACTIVE",
  "SCORING_CLOSED",
  "COMPLETED",
]);

export const createEventSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).default(""),
  date: z.string().datetime(),
  timerDuration: z.number().int().min(30).max(3600).default(300),
  uniqueTaskAssignment: z.boolean().default(false),
});

export const updateEventSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  date: z.string().datetime().optional(),
  timerDuration: z.number().int().min(30).max(3600).optional(),
  uniqueTaskAssignment: z.boolean().optional(),
});

export const updateEventStatusSchema = z.object({
  status: eventStatusSchema,
});
