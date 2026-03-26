import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EvaluationService } from '../evaluation.service.js';

vi.mock('../../config.js', () => ({
  config: { JWT_SECRET: 'test_secret' },
}));

vi.mock('../../ws/broadcaster.js', () => ({
  Broadcaster: {
    broadcastToEvent: vi.fn(),
    broadcastToJury: vi.fn(),
    broadcastToOrganizer: vi.fn(),
  },
}));

vi.mock('../../prisma.js', () => {
  return {
    prisma: {
      event: {
        findUnique: vi.fn(),
      },
      team: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
      },
      criterion: {
        findMany: vi.fn(),
      },
      teamEvaluation: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
      },
      score: {
        upsert: vi.fn(),
        deleteMany: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  };
});

describe('EvaluationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getEventForJury', () => {
    it('should return event data with criteria', async () => {
      const { prisma } = await import('../../prisma.js');
      const mockEvent = {
        id: 'e1',
        title: 'Ideathon',
        description: 'Test',
        date: new Date(),
        logoPath: null,
        status: 'ACTIVE',
        currentTeamId: 't1',
        scoringTeamId: 't1',
        timerDuration: 300,
        criteria: [
          { id: 'c1', name: 'Innovation', description: null, maxScore: 10, sortOrder: 0 },
        ],
      };
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);

      const result = await EvaluationService.getEventForJury('e1');

      expect(result.title).toBe('Ideathon');
      expect(result.criteria).toHaveLength(1);
    });

    it('should throw not found when event does not exist', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(null);

      await expect(EvaluationService.getEventForJury('e1')).rejects.toThrow(
        'Event not found',
      );
    });
  });

  describe('getTeamsForJury', () => {
    it('should return teams with evaluation status', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.team.findMany).mockResolvedValue([
        {
          id: 't1',
          name: 'Alpha',
          projectDescription: 'Project A',
          presentationOrder: 1,
          participants: [{ id: 'p1', name: 'Alice' }],
          task: { id: 'task1', title: 'Task 1' },
          evaluations: [
            {
              id: 'ev1',
              status: 'DRAFT',
              comment: null,
              scores: [{ criterionId: 'c1', value: 8 }],
            },
          ],
        },
        {
          id: 't2',
          name: 'Beta',
          projectDescription: null,
          presentationOrder: 2,
          participants: [],
          task: null,
          evaluations: [],
        },
      ] as any);

      const result = await EvaluationService.getTeamsForJury('e1', 'j1');

      expect(result).toHaveLength(2);
      expect(result[0].evaluation).not.toBeNull();
      expect(result[0].evaluation!.status).toBe('DRAFT');
      expect(result[1].evaluation).toBeNull();
    });
  });

  describe('getTeamForJury', () => {
    it('should return single team with evaluation', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.team.findFirst).mockResolvedValue({
        id: 't1',
        name: 'Alpha',
        projectDescription: 'Project A',
        presentationOrder: 1,
        participants: [{ id: 'p1', name: 'Alice' }],
        task: { id: 'task1', title: 'Task 1', description: 'Desc' },
        evaluations: [],
      } as any);

      const result = await EvaluationService.getTeamForJury('e1', 't1', 'j1');

      expect(result.id).toBe('t1');
      expect(result.evaluation).toBeNull();
    });

    it('should throw not found when team does not exist', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.team.findFirst).mockResolvedValue(null);

      await expect(
        EvaluationService.getTeamForJury('e1', 't99', 'j1'),
      ).rejects.toThrow('Team not found');
    });
  });

  describe('saveScores', () => {
    const mockActiveEvent = {
      id: 'e1',
      status: 'ACTIVE',
      scoringTeamId: 't1',
      organizerId: 'o1',
    };

    it('should save scores as draft', async () => {
      const { prisma } = await import('../../prisma.js');
      const { Broadcaster } = await import('../../ws/broadcaster.js');

      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockActiveEvent as any);
      vi.mocked(prisma.team.findFirst).mockResolvedValue({ id: 't1', eventId: 'e1' } as any);
      vi.mocked(prisma.criterion.findMany).mockResolvedValue([
        { id: 'c1', maxScore: 10 },
        { id: 'c2', maxScore: 5 },
      ] as any);

      const mockEvaluation = {
        id: 'ev1',
        status: 'DRAFT',
        comment: 'Good work',
        scores: [
          { id: 's1', criterionId: 'c1', value: 8 },
          { id: 's2', criterionId: 'c2', value: 4 },
        ],
      };
      vi.mocked(prisma.$transaction).mockResolvedValue(mockEvaluation);

      const result = await EvaluationService.saveScores('e1', 't1', 'j1', {
        scores: [
          { criterionId: 'c1', value: 8 },
          { criterionId: 'c2', value: 4 },
        ],
        comment: 'Good work',
      });

      expect(result).toEqual(mockEvaluation);
      expect(Broadcaster.broadcastToOrganizer).toHaveBeenCalledWith(
        'e1',
        'o1',
        'scores:updated',
        expect.objectContaining({ juryMemberId: 'j1', teamId: 't1', status: 'DRAFT' }),
      );
    });

    it('should reject when event is not active', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        ...mockActiveEvent,
        status: 'DRAFT',
      } as any);

      await expect(
        EvaluationService.saveScores('e1', 't1', 'j1', {
          scores: [{ criterionId: 'c1', value: 5 }],
          comment: null,
        }),
      ).rejects.toThrow('Event is not active');
    });

    it('should reject when scoring is not open for this team', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        ...mockActiveEvent,
        scoringTeamId: 't2', // different team
      } as any);

      await expect(
        EvaluationService.saveScores('e1', 't1', 'j1', {
          scores: [{ criterionId: 'c1', value: 5 }],
          comment: null,
        }),
      ).rejects.toThrow('Scoring is not open for this team');
    });

    it('should reject when score exceeds max score', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockActiveEvent as any);
      vi.mocked(prisma.team.findFirst).mockResolvedValue({ id: 't1', eventId: 'e1' } as any);
      vi.mocked(prisma.criterion.findMany).mockResolvedValue([
        { id: 'c1', maxScore: 10 },
      ] as any);

      await expect(
        EvaluationService.saveScores('e1', 't1', 'j1', {
          scores: [{ criterionId: 'c1', value: 15 }],
          comment: null,
        }),
      ).rejects.toThrow('Score 15 exceeds maximum 10');
    });

    it('should reject when criterion not in event', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockActiveEvent as any);
      vi.mocked(prisma.team.findFirst).mockResolvedValue({ id: 't1', eventId: 'e1' } as any);
      vi.mocked(prisma.criterion.findMany).mockResolvedValue([
        { id: 'c1', maxScore: 10 },
      ] as any);

      await expect(
        EvaluationService.saveScores('e1', 't1', 'j1', {
          scores: [{ criterionId: 'c999', value: 5 }],
          comment: null,
        }),
      ).rejects.toThrow('Criterion c999 not found in this event');
    });

    it('should allow saving over a previously confirmed evaluation (moves to DRAFT)', async () => {
      const { prisma } = await import('../../prisma.js');
      const { Broadcaster } = await import('../../ws/broadcaster.js');

      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockActiveEvent as any);
      vi.mocked(prisma.team.findFirst).mockResolvedValue({ id: 't1', eventId: 'e1' } as any);
      vi.mocked(prisma.criterion.findMany).mockResolvedValue([
        { id: 'c1', maxScore: 10 },
      ] as any);

      const mockEvaluation = {
        id: 'ev1',
        status: 'DRAFT',
        comment: 'Updated',
        scores: [{ id: 's1', criterionId: 'c1', value: 7 }],
      };
      vi.mocked(prisma.$transaction).mockResolvedValue(mockEvaluation);

      const result = await EvaluationService.saveScores('e1', 't1', 'j1', {
        scores: [{ criterionId: 'c1', value: 7 }],
        comment: 'Updated',
      });

      expect(result).toEqual(mockEvaluation);
      expect(Broadcaster.broadcastToOrganizer).toHaveBeenCalled();
    });

    it('should delete stale scores not present in request (full replacement)', async () => {
      const { prisma } = await import('../../prisma.js');

      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockActiveEvent as any);
      vi.mocked(prisma.team.findFirst).mockResolvedValue({ id: 't1', eventId: 'e1' } as any);
      vi.mocked(prisma.criterion.findMany).mockResolvedValue([
        { id: 'c1', maxScore: 10 },
      ] as any);

      // Use implementation to run the transaction callback so we can inspect inner calls
      const txProxy = {
        teamEvaluation: {
          upsert: vi.fn().mockResolvedValue({ id: 'ev1' }),
          findUnique: vi.fn().mockResolvedValue({
            id: 'ev1',
            status: 'DRAFT',
            comment: 'Re-edit',
            scores: [{ id: 's1', criterionId: 'c1', value: 5 }],
          }),
        },
        score: {
          deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
          upsert: vi.fn().mockResolvedValue({}),
        },
      };
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => cb(txProxy));

      await EvaluationService.saveScores('e1', 't1', 'j1', {
        scores: [{ criterionId: 'c1', value: 5 }],
        comment: 'Re-edit',
      });

      // Scores for criteria NOT in the payload (c2 was removed) should be deleted
      expect(txProxy.score.deleteMany).toHaveBeenCalledWith({
        where: {
          evaluationId: 'ev1',
          criterionId: { notIn: ['c1'] },
        },
      });
    });
  });

  describe('confirmEvaluation', () => {
    it('should confirm a draft evaluation with all criteria scored', async () => {
      const { prisma } = await import('../../prisma.js');
      const { Broadcaster } = await import('../../ws/broadcaster.js');

      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'e1',
        status: 'ACTIVE',
        scoringTeamId: 't1',
        organizerId: 'o1',
      } as any);
      vi.mocked(prisma.teamEvaluation.findUnique).mockResolvedValue({
        id: 'ev1',
        status: 'DRAFT',
        scores: [
          { criterionId: 'c1', value: 8 },
          { criterionId: 'c2', value: 4 },
        ],
      } as any);
      vi.mocked(prisma.criterion.findMany).mockResolvedValue([
        { id: 'c1' },
        { id: 'c2' },
      ] as any);
      vi.mocked(prisma.teamEvaluation.update).mockResolvedValue({
        id: 'ev1',
        status: 'CONFIRMED',
        scores: [
          { id: 's1', criterionId: 'c1', value: 8 },
          { id: 's2', criterionId: 'c2', value: 4 },
        ],
      } as any);

      const result = await EvaluationService.confirmEvaluation('e1', 't1', 'j1');

      expect(result.status).toBe('CONFIRMED');
      expect(Broadcaster.broadcastToOrganizer).toHaveBeenCalledWith(
        'e1',
        'o1',
        'scores:updated',
        expect.objectContaining({ status: 'CONFIRMED' }),
      );
    });

    it('should reject when evaluation not found', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'e1',
        status: 'ACTIVE',
        scoringTeamId: 't1',
        organizerId: 'o1',
      } as any);
      vi.mocked(prisma.teamEvaluation.findUnique).mockResolvedValue(null);

      await expect(
        EvaluationService.confirmEvaluation('e1', 't1', 'j1'),
      ).rejects.toThrow('Evaluation not found');
    });

    it('should reject when scoring is not open for this team', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'e1',
        status: 'ACTIVE',
        scoringTeamId: 't2', // different team
        organizerId: 'o1',
      } as any);

      await expect(
        EvaluationService.confirmEvaluation('e1', 't1', 'j1'),
      ).rejects.toThrow('Scoring is not open for this team');
    });

    it('should reject when not all criteria are scored', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'e1',
        status: 'ACTIVE',
        scoringTeamId: 't1',
        organizerId: 'o1',
      } as any);
      vi.mocked(prisma.teamEvaluation.findUnique).mockResolvedValue({
        id: 'ev1',
        status: 'DRAFT',
        scores: [{ criterionId: 'c1', value: 8 }],
      } as any);
      vi.mocked(prisma.criterion.findMany).mockResolvedValue([
        { id: 'c1' },
        { id: 'c2' },
        { id: 'c3' },
      ] as any);

      await expect(
        EvaluationService.confirmEvaluation('e1', 't1', 'j1'),
      ).rejects.toThrow('Missing scores for 2 criteria');
    });

    it('should reject when event is not active', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'e1',
        status: 'COMPLETED',
        organizerId: 'o1',
      } as any);

      await expect(
        EvaluationService.confirmEvaluation('e1', 't1', 'j1'),
      ).rejects.toThrow('Event is not active');
    });
  });
});
