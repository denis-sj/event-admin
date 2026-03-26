import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CriterionService } from '../criterion.service.js';

vi.mock('../../config.js', () => ({
  config: { JWT_SECRET: 'test_secret' },
}));

vi.mock('../../prisma.js', () => {
  return {
    prisma: {
      event: {
        findUnique: vi.fn(),
      },
      criterion: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
        aggregate: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  };
});

describe('CriterionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('should return criteria sorted by order', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'e1',
        organizerId: 'o1',
        status: 'DRAFT',
      } as any);
      const mockCriteria = [
        { id: 'c1', name: 'Crit 1', sortOrder: 0 },
        { id: 'c2', name: 'Crit 2', sortOrder: 1 },
      ];
      vi.mocked(prisma.criterion.findMany).mockResolvedValue(mockCriteria as any);

      const result = await CriterionService.list('e1', 'o1');
      expect(result).toEqual(mockCriteria);
    });

    it('should throw not found for non-existent event', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(null);

      await expect(CriterionService.list('e1', 'o1')).rejects.toThrow('Event not found');
    });
  });

  describe('create', () => {
    it('should create a criterion in DRAFT event', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'e1',
        organizerId: 'o1',
        status: 'DRAFT',
      } as any);
      vi.mocked(prisma.criterion.count).mockResolvedValue(0);
      vi.mocked(prisma.criterion.aggregate).mockResolvedValue({
        _max: { sortOrder: null },
      } as any);
      vi.mocked(prisma.criterion.create).mockResolvedValue({
        id: 'c1',
        name: 'Innovation',
        maxScore: 10,
        sortOrder: 0,
      } as any);

      const result = await CriterionService.create('e1', 'o1', {
        name: 'Innovation',
        description: null,
        maxScore: 10,
      });

      expect(result.name).toBe('Innovation');
      expect(prisma.criterion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventId: 'e1',
          name: 'Innovation',
          maxScore: 10,
          sortOrder: 0,
        }),
      });
    });

    it('should reject creating criteria in ACTIVE event', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'e1',
        organizerId: 'o1',
        status: 'ACTIVE',
      } as any);

      await expect(
        CriterionService.create('e1', 'o1', {
          name: 'Innovation',
          description: null,
          maxScore: 10,
        }),
      ).rejects.toThrow('Cannot modify criteria after event has been activated');
    });

    it('should reject when max criteria limit reached', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'e1',
        organizerId: 'o1',
        status: 'DRAFT',
      } as any);
      vi.mocked(prisma.criterion.count).mockResolvedValue(20);

      await expect(
        CriterionService.create('e1', 'o1', {
          name: 'Test',
          description: null,
          maxScore: 10,
        }),
      ).rejects.toThrow('Maximum 20 criteria allowed per event');
    });
  });

  describe('update', () => {
    it('should update criterion in DRAFT event', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'e1',
        organizerId: 'o1',
        status: 'DRAFT',
      } as any);
      vi.mocked(prisma.criterion.findFirst).mockResolvedValue({
        id: 'c1',
        eventId: 'e1',
      } as any);
      vi.mocked(prisma.criterion.update).mockResolvedValue({
        id: 'c1',
        name: 'Updated',
        maxScore: 20,
      } as any);

      const result = await CriterionService.update('e1', 'c1', 'o1', {
        name: 'Updated',
        maxScore: 20,
      });

      expect(result.name).toBe('Updated');
    });

    it('should reject update in ACTIVE event', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'e1',
        organizerId: 'o1',
        status: 'ACTIVE',
      } as any);

      await expect(
        CriterionService.update('e1', 'c1', 'o1', { name: 'Updated' }),
      ).rejects.toThrow('Cannot modify criteria after event has been activated');
    });

    it('should throw not found for non-existent criterion', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'e1',
        organizerId: 'o1',
        status: 'DRAFT',
      } as any);
      vi.mocked(prisma.criterion.findFirst).mockResolvedValue(null);

      await expect(
        CriterionService.update('e1', 'c1', 'o1', { name: 'Test' }),
      ).rejects.toThrow('Criterion not found');
    });
  });

  describe('delete', () => {
    it('should delete criterion in DRAFT event', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'e1',
        organizerId: 'o1',
        status: 'DRAFT',
      } as any);
      vi.mocked(prisma.criterion.findFirst).mockResolvedValue({
        id: 'c1',
        eventId: 'e1',
      } as any);
      vi.mocked(prisma.criterion.delete).mockResolvedValue({} as any);

      await CriterionService.delete('e1', 'c1', 'o1');

      expect(prisma.criterion.delete).toHaveBeenCalledWith({
        where: { id: 'c1' },
      });
    });

    it('should reject delete in non-DRAFT event', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'e1',
        organizerId: 'o1',
        status: 'SCORING_CLOSED',
      } as any);

      await expect(CriterionService.delete('e1', 'c1', 'o1')).rejects.toThrow(
        'Cannot modify criteria after event has been activated',
      );
    });
  });

  describe('reorder', () => {
    it('should reorder criteria', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'e1',
        organizerId: 'o1',
        status: 'DRAFT',
      } as any);
      vi.mocked(prisma.criterion.findMany).mockResolvedValueOnce([
        { id: 'c1' },
        { id: 'c2' },
        { id: 'c3' },
      ] as any);
      vi.mocked(prisma.$transaction).mockResolvedValue([]);
      vi.mocked(prisma.criterion.findMany).mockResolvedValueOnce([
        { id: 'c3', sortOrder: 0 },
        { id: 'c1', sortOrder: 1 },
        { id: 'c2', sortOrder: 2 },
      ] as any);

      const result = await CriterionService.reorder('e1', 'o1', ['c3', 'c1', 'c2']);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result).toHaveLength(3);
    });

    it('should reject reorder in ACTIVE event', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'e1',
        organizerId: 'o1',
        status: 'ACTIVE',
      } as any);

      await expect(
        CriterionService.reorder('e1', 'o1', ['c1', 'c2']),
      ).rejects.toThrow('Cannot modify criteria after event has been activated');
    });

    it('should reject reorder in COMPLETED event', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'e1',
        organizerId: 'o1',
        status: 'COMPLETED',
      } as any);

      await expect(
        CriterionService.reorder('e1', 'o1', ['c1', 'c2']),
      ).rejects.toThrow('Cannot modify criteria after event has been activated');
    });

    it('should reject reorder with mismatched IDs', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'e1',
        organizerId: 'o1',
        status: 'DRAFT',
      } as any);
      vi.mocked(prisma.criterion.findMany).mockResolvedValue([
        { id: 'c1' },
        { id: 'c2' },
      ] as any);

      await expect(
        CriterionService.reorder('e1', 'o1', ['c1', 'c3']),
      ).rejects.toThrow('Provided criterion IDs do not match the existing criteria');
    });
  });
});
