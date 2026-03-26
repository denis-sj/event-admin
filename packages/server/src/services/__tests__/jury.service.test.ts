import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JuryService } from '../jury.service.js';

vi.mock('../../config.js', () => ({
  config: { JWT_SECRET: 'test_secret', BASE_URL: 'http://localhost:4321' },
}));

vi.mock('../../ws/server.js', () => ({
  wss: {
    clients: new Set(),
  },
}));

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,MOCK_QR'),
  },
}));

vi.mock('../../prisma.js', () => {
  return {
    prisma: {
      event: {
        findUnique: vi.fn(),
      },
      juryMember: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },
      team: {
        count: vi.fn(),
      },
    },
  };
});

describe('JuryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockEvent = { id: 'e1', organizerId: 'o1', status: 'DRAFT' };

  describe('list', () => {
    it('should return jury members with activity info', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      vi.mocked(prisma.team.count).mockResolvedValue(5);
      vi.mocked(prisma.juryMember.findMany).mockResolvedValue([
        {
          id: 'j1',
          eventId: 'e1',
          name: 'Judge 1',
          email: 'judge@test.com',
          firstLogin: null,
          lastActive: null,
          evaluations: [
            { status: 'CONFIRMED' },
            { status: 'CONFIRMED' },
            { status: 'DRAFT' },
          ],
        },
      ] as any);

      const result = await JuryService.list('e1', 'o1');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Judge 1');
      expect(result[0].isOnline).toBe(false);
      expect(result[0].confirmedEvaluations).toBe(2);
      expect(result[0].draftEvaluations).toBe(1);
      expect(result[0].totalTeams).toBe(5);
    });

    it('should reject when event not found', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(null);

      await expect(JuryService.list('e1', 'o1')).rejects.toThrow('Event not found');
    });

    it('should reject when organizer does not own event', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        ...mockEvent,
        organizerId: 'other',
      } as any);

      await expect(JuryService.list('e1', 'o1')).rejects.toThrow('Access denied');
    });
  });

  describe('create', () => {
    it('should create a jury member with a generated token', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      vi.mocked(prisma.juryMember.count).mockResolvedValue(0);
      vi.mocked(prisma.juryMember.create).mockResolvedValue({
        id: 'j1',
        eventId: 'e1',
        name: 'Judge 1',
        email: null,
        token: 'a'.repeat(64),
        firstLogin: null,
        lastActive: null,
      } as any);

      const result = await JuryService.create('e1', 'o1', {
        name: 'Judge 1',
        email: null,
      });

      expect(result.name).toBe('Judge 1');
      expect(result.token).toBeDefined();
      // Verify create was called with a 64-char hex token
      expect(vi.mocked(prisma.juryMember.create)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            token: expect.stringMatching(/^[0-9a-f]{64}$/),
          }),
        }),
      );
    });

    it('should reject when max jury limit reached', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      vi.mocked(prisma.juryMember.count).mockResolvedValue(20);

      await expect(
        JuryService.create('e1', 'o1', { name: 'Judge', email: null }),
      ).rejects.toThrow('Maximum 20 jury members allowed per event');
    });
  });

  describe('update', () => {
    it('should update jury member fields', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      vi.mocked(prisma.juryMember.findFirst).mockResolvedValue({
        id: 'j1',
        eventId: 'e1',
      } as any);
      vi.mocked(prisma.juryMember.update).mockResolvedValue({
        id: 'j1',
        name: 'Updated Judge',
      } as any);

      const result = await JuryService.update('e1', 'j1', 'o1', {
        name: 'Updated Judge',
      });

      expect(result.name).toBe('Updated Judge');
    });

    it('should throw not found when jury member does not exist', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      vi.mocked(prisma.juryMember.findFirst).mockResolvedValue(null);

      await expect(
        JuryService.update('e1', 'j1', 'o1', { name: 'Test' }),
      ).rejects.toThrow('Jury member not found');
    });
  });

  describe('delete', () => {
    it('should delete a jury member', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      vi.mocked(prisma.juryMember.findFirst).mockResolvedValue({
        id: 'j1',
        eventId: 'e1',
      } as any);
      vi.mocked(prisma.juryMember.delete).mockResolvedValue({} as any);

      await JuryService.delete('e1', 'j1', 'o1');

      expect(prisma.juryMember.delete).toHaveBeenCalledWith({ where: { id: 'j1' } });
    });

    it('should throw not found when jury member does not exist', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      vi.mocked(prisma.juryMember.findFirst).mockResolvedValue(null);

      await expect(JuryService.delete('e1', 'j1', 'o1')).rejects.toThrow(
        'Jury member not found',
      );
    });
  });

  describe('regenerateToken', () => {
    it('should regenerate token for a jury member', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      vi.mocked(prisma.juryMember.findFirst).mockResolvedValue({
        id: 'j1',
        eventId: 'e1',
        token: 'old_token',
      } as any);
      vi.mocked(prisma.juryMember.update).mockResolvedValue({
        id: 'j1',
        eventId: 'e1',
        name: 'Judge',
        email: null,
        token: 'b'.repeat(64),
        firstLogin: null,
        lastActive: null,
      } as any);

      const result = await JuryService.regenerateToken('e1', 'j1', 'o1');

      expect(result.token).toBeDefined();
      expect(vi.mocked(prisma.juryMember.update)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            token: expect.stringMatching(/^[0-9a-f]{64}$/),
          }),
        }),
      );
    });
  });

  describe('getQrCode', () => {
    it('should return QR code data', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      vi.mocked(prisma.juryMember.findFirst).mockResolvedValue({
        token: 'test_token_hex',
        name: 'Judge 1',
      } as any);

      const result = await JuryService.getQrCode('e1', 'j1', 'o1');

      expect(result.name).toBe('Judge 1');
      expect(result.url).toBe('http://localhost:4321/jury/test_token_hex');
      expect(result.qrCode).toContain('data:image/png');
    });

    it('should throw not found when jury member does not exist', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      vi.mocked(prisma.juryMember.findFirst).mockResolvedValue(null);

      await expect(JuryService.getQrCode('e1', 'j1', 'o1')).rejects.toThrow(
        'Jury member not found',
      );
    });
  });

  describe('getActivity', () => {
    it('should return jury activity with evaluation statuses', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      vi.mocked(prisma.juryMember.findMany).mockResolvedValue([
        {
          id: 'j1',
          name: 'Judge 1',
          firstLogin: new Date('2025-01-01'),
          lastActive: new Date('2025-01-02'),
          evaluations: [
            { teamId: 't1', status: 'CONFIRMED' },
            { teamId: 't2', status: 'DRAFT' },
          ],
        },
      ] as any);

      const result = await JuryService.getActivity('e1', 'o1');

      expect(result).toHaveLength(1);
      expect(result[0].evaluations).toHaveLength(2);
      expect(result[0].evaluations[0].status).toBe('CONFIRMED');
      expect(result[0].isOnline).toBe(false);
    });
  });
});
