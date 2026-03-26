import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResultsService } from '../results.service.js';

vi.mock('../../config.js', () => ({
  config: { JWT_SECRET: 'test_secret' },
}));

vi.mock('../../prisma.js', () => {
  return {
    prisma: {
      event: {
        findUnique: vi.fn(),
      },
      team: {
        findMany: vi.fn(),
      },
      criterion: {
        findMany: vi.fn(),
      },
      juryMember: {
        findMany: vi.fn(),
      },
    },
  };
});

describe('ResultsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('calculateResults', () => {
    it('should calculate per-criterion averages, totalAvgScore, and ranking for teams', async () => {
      const { prisma } = await import('../../prisma.js');

      vi.mocked(prisma.team.findMany).mockResolvedValue([
        {
          id: 't1',
          name: 'Alpha',
          task: { id: 'task1', title: 'Task A' },
          evaluations: [
            {
              juryMember: { id: 'j1', name: 'Jury 1' },
              comment: null,
              scores: [
                { criterion: { id: 'c1', name: 'Innovation', maxScore: 10 }, criterionId: 'c1', value: 9 },
                { criterion: { id: 'c2', name: 'Design', maxScore: 10 }, criterionId: 'c2', value: 8 },
              ],
            },
            {
              juryMember: { id: 'j2', name: 'Jury 2' },
              comment: 'Good',
              scores: [
                { criterion: { id: 'c1', name: 'Innovation', maxScore: 10 }, criterionId: 'c1', value: 7 },
                { criterion: { id: 'c2', name: 'Design', maxScore: 10 }, criterionId: 'c2', value: 6 },
              ],
            },
          ],
        },
        {
          id: 't2',
          name: 'Beta',
          task: { id: 'task2', title: 'Task B' },
          evaluations: [
            {
              juryMember: { id: 'j1', name: 'Jury 1' },
              comment: null,
              scores: [
                { criterion: { id: 'c1', name: 'Innovation', maxScore: 10 }, criterionId: 'c1', value: 10 },
                { criterion: { id: 'c2', name: 'Design', maxScore: 10 }, criterionId: 'c2', value: 10 },
              ],
            },
            {
              juryMember: { id: 'j2', name: 'Jury 2' },
              comment: 'Excellent',
              scores: [
                { criterion: { id: 'c1', name: 'Innovation', maxScore: 10 }, criterionId: 'c1', value: 9 },
                { criterion: { id: 'c2', name: 'Design', maxScore: 10 }, criterionId: 'c2', value: 9 },
              ],
            },
          ],
        },
      ] as any);

      vi.mocked(prisma.criterion.findMany).mockResolvedValue([
        { id: 'c1', name: 'Innovation', maxScore: 10, sortOrder: 0 },
        { id: 'c2', name: 'Design', maxScore: 10, sortOrder: 1 },
      ] as any);

      const response = await ResultsService.calculateResults('e1');

      expect(response.filter.taskId).toBeNull();
      expect(response.anomalyThreshold).toBe(2);
      expect(response.teams).toHaveLength(2);

      // Beta: c1 avg = (10+9)/2=9.5, c2 avg = (10+9)/2=9.5, totalAvg = (9.5+9.5)/2 = 9.5
      // Alpha: c1 avg = (9+7)/2=8, c2 avg = (8+6)/2=7, totalAvg = (8+7)/2 = 7.5
      expect(response.teams[0].name).toBe('Beta');
      expect(response.teams[0].rank).toBe(1);
      expect(response.teams[0].totalAvgScore).toBe(9.5);
      expect(response.teams[0].criteriaScores).toHaveLength(2);
      expect(response.teams[0].criteriaScores[0].avgScore).toBe(9.5);

      expect(response.teams[1].name).toBe('Alpha');
      expect(response.teams[1].rank).toBe(2);
      expect(response.teams[1].totalAvgScore).toBe(7.5);
    });

    it('should handle teams with no evaluations', async () => {
      const { prisma } = await import('../../prisma.js');

      vi.mocked(prisma.team.findMany).mockResolvedValue([
        {
          id: 't1',
          name: 'Alpha',
          task: null,
          evaluations: [],
        },
      ] as any);

      vi.mocked(prisma.criterion.findMany).mockResolvedValue([
        { id: 'c1', name: 'Innovation', maxScore: 10, sortOrder: 0 },
      ] as any);

      const response = await ResultsService.calculateResults('e1');

      expect(response.teams).toHaveLength(1);
      expect(response.teams[0].totalAvgScore).toBe(0);
      expect(response.teams[0].rank).toBe(1);
      expect(response.teams[0].taskTitle).toBeNull();
      expect(response.teams[0].criteriaScores[0].avgScore).toBe(0);
      expect(response.teams[0].criteriaScores[0].juryScores).toHaveLength(0);
    });

    it('should detect anomalies when score deviates > 2 stddev from mean', async () => {
      const { prisma } = await import('../../prisma.js');

      // Scores for c1: [10, 10, 10, 10, 10, 0]
      // mean = 50/6 ≈ 8.33, stddev ≈ 3.73
      // |0 - 8.33| = 8.33 > 2*3.73 = 7.45 → anomaly!
      vi.mocked(prisma.team.findMany).mockResolvedValue([
        {
          id: 't1', name: 'A', task: null,
          evaluations: [
            { juryMember: { id: 'j1', name: 'J1' }, comment: null, scores: [{ criterion: { id: 'c1', name: 'C1', maxScore: 10 }, criterionId: 'c1', value: 10 }] },
            { juryMember: { id: 'j2', name: 'J2' }, comment: null, scores: [{ criterion: { id: 'c1', name: 'C1', maxScore: 10 }, criterionId: 'c1', value: 10 }] },
            { juryMember: { id: 'j3', name: 'J3' }, comment: null, scores: [{ criterion: { id: 'c1', name: 'C1', maxScore: 10 }, criterionId: 'c1', value: 10 }] },
          ],
        },
        {
          id: 't2', name: 'B', task: null,
          evaluations: [
            { juryMember: { id: 'j1', name: 'J1' }, comment: null, scores: [{ criterion: { id: 'c1', name: 'C1', maxScore: 10 }, criterionId: 'c1', value: 10 }] },
            { juryMember: { id: 'j2', name: 'J2' }, comment: null, scores: [{ criterion: { id: 'c1', name: 'C1', maxScore: 10 }, criterionId: 'c1', value: 10 }] },
            { juryMember: { id: 'j3', name: 'J3' }, comment: null, scores: [{ criterion: { id: 'c1', name: 'C1', maxScore: 10 }, criterionId: 'c1', value: 0 }] },
          ],
        },
      ] as any);

      vi.mocked(prisma.criterion.findMany).mockResolvedValue([
        { id: 'c1', name: 'C1', maxScore: 10, sortOrder: 0 },
      ] as any);

      const response = await ResultsService.calculateResults('e1');

      const anomalies = response.teams
        .flatMap((r) => r.criteriaScores)
        .flatMap((c) => c.juryScores)
        .filter((s) => s.isAnomaly);

      expect(anomalies.length).toBeGreaterThan(0);
      expect(anomalies[0].value).toBe(0);
    });

    it('should include jury comments in juryScores', async () => {
      const { prisma } = await import('../../prisma.js');

      vi.mocked(prisma.team.findMany).mockResolvedValue([
        {
          id: 't1', name: 'A', task: null,
          evaluations: [
            {
              juryMember: { id: 'j1', name: 'J1' },
              comment: 'Great presentation!',
              scores: [{ criterion: { id: 'c1', name: 'C1', maxScore: 10 }, criterionId: 'c1', value: 9 }],
            },
          ],
        },
      ] as any);

      vi.mocked(prisma.criterion.findMany).mockResolvedValue([
        { id: 'c1', name: 'C1', maxScore: 10, sortOrder: 0 },
      ] as any);

      const response = await ResultsService.calculateResults('e1');

      expect(response.teams[0].criteriaScores[0].juryScores[0].comment).toBe('Great presentation!');
    });

    it('should filter results by taskId and include it in response', async () => {
      const { prisma } = await import('../../prisma.js');

      vi.mocked(prisma.team.findMany).mockResolvedValue([
        {
          id: 't1',
          name: 'Alpha',
          task: { id: 'task1', title: 'Task A' },
          evaluations: [],
        },
      ] as any);

      vi.mocked(prisma.criterion.findMany).mockResolvedValue([] as any);

      const response = await ResultsService.calculateResults('e1', 'task1');

      expect(response.filter.taskId).toBe('task1');
      expect(vi.mocked(prisma.team.findMany)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { eventId: 'e1', taskId: 'task1' },
        }),
      );
    });
  });

  describe('getResults', () => {
    it('should verify event ownership', async () => {
      const { prisma } = await import('../../prisma.js');

      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        organizerId: 'other-org',
      } as any);

      await expect(
        ResultsService.getResults('e1', 'org1'),
      ).rejects.toThrow('Access denied');
    });

    it('should throw not found for missing event', async () => {
      const { prisma } = await import('../../prisma.js');

      vi.mocked(prisma.event.findUnique).mockResolvedValue(null);

      await expect(
        ResultsService.getResults('e1', 'org1'),
      ).rejects.toThrow('Event not found');
    });
  });
});
