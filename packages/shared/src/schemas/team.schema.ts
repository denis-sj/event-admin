import { z } from "zod";

export const createTeamSchema = z.object({
  name: z.string().min(1).max(200),
  projectDescription: z.string().max(5000).nullable().default(null),
});

export const updateTeamSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  projectDescription: z.string().max(5000).nullable().optional(),
  taskId: z.string().uuid().nullable().optional(),
});

export const createParticipantSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().nullable().default(null),
});

export const updateParticipantSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().nullable().optional(),
});

export const setPresentationOrderSchema = z.object({
  teamIds: z.array(z.string().uuid()),
});
