import { z } from "zod";

export const taskDifficultySchema = z.enum(["LOW", "MEDIUM", "HIGH"]);

export const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).nullable().default(null),
  difficulty: taskDifficultySchema.default("MEDIUM"),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  difficulty: taskDifficultySchema.optional(),
});

export const assignTaskSchema = z.object({
  teamId: z.string().uuid(),
  taskId: z.string().uuid().nullable(),
});
