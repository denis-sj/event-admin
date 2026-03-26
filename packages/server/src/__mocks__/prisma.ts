import { PrismaClient } from '@prisma/client';
import { vi } from 'vitest';

export const prisma = {
  organizer: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  event: {
    findUnique: vi.fn(),
  },
  juryMember: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  $disconnect: vi.fn(),
  $queryRaw: vi.fn(),
} as unknown as PrismaClient;
