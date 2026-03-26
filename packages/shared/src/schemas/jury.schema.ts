import { z } from "zod";

export const createJuryMemberSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().nullable().default(null),
});

export const updateJuryMemberSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().nullable().optional(),
});
