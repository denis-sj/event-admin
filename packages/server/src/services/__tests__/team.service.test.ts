import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TeamService } from '../team.service.js';

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
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },
      participant: {
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        findFirst: vi.fn(),
        count: vi.fn(),
      },
      task: {
        findFirst: vi.fn(),
      },
      teamEvaluation: {
        count: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  };
});

describe('TeamService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockEvent = { id: 'e1', organizerId: 'o1', status: 'DRAFT', uniqueTaskAssignment: false };

  describe('list', () => {
    it('should return teams with participants and tasks', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      const mockTeams = [
        {
          id: 't1',
          name: 'Alpha',
          participants: [{ id: 'p1', name: 'Alice' }],
          task: { id: 'task1', title: 'Task' },
          _count: { evaluations: 0 },
        },
      ];
      vi.mocked(prisma.team.findMany).mockResolvedValue(mockTeams as any);

      const result = await TeamService.list('e1', 'o1');
      expect(result).toEqual(mockTeams);
      expect(prisma.team.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { eventId: 'e1' } }),
      );
    });

    it('should reject when event not found', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(null);

      await expect(TeamService.list('e1', 'o1')).rejects.toThrow('Event not found');
    });

    it('should reject when organizer does not own event', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        ...mockEvent,
        organizerId: 'other',
      } as any);

      await expect(TeamService.list('e1', 'o1')).rejects.toThrow('Access denied');
    });
  });

  describe('create', () => {
    it('should create a team', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      vi.mocked(prisma.team.count).mockResolvedValue(0);
      // findMany for name uniqueness check returns empty array
      vi.mocked(prisma.team.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.team.create).mockResolvedValue({
        id: 't1',
        name: 'Alpha',
        eventId: 'e1',
        participants: [],
      } as any);

      const result = await TeamService.create('e1', 'o1', {
        name: 'Alpha',
        projectDescription: null,
      });

      expect(result.name).toBe('Alpha');
    });

    it('should reject when max teams limit reached', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      vi.mocked(prisma.team.count).mockResolvedValue(50);

      await expect(
        TeamService.create('e1', 'o1', { name: 'New', projectDescription: null }),
      ).rejects.toThrow('Maximum 50 teams allowed per event');
    });

    it('should reject duplicate team name (case-insensitive)', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      vi.mocked(prisma.team.count).mockResolvedValue(1);
      // findMany returns existing team with name 'Alpha'
      vi.mocked(prisma.team.findMany).mockResolvedValue([
        { name: 'Alpha' },
      ] as any);

      await expect(
        TeamService.create('e1', 'o1', { name: 'alpha', projectDescription: null }),
      ).rejects.toThrow('Team "alpha" already exists');
    });
  });

  describe('update', () => {
    it('should update team fields', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      vi.mocked(prisma.team.findFirst).mockResolvedValueOnce({
        id: 't1',
        eventId: 'e1',
      } as any);
      // findMany for name uniqueness check returns empty (no conflicts)
      vi.mocked(prisma.team.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.team.update).mockResolvedValue({
        id: 't1',
        name: 'Updated',
        participants: [],
        task: null,
      } as any);

      const result = await TeamService.update('e1', 't1', 'o1', {
        name: 'Updated',
      });

      expect(result.name).toBe('Updated');
    });

    it('should throw not found when team does not exist', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      vi.mocked(prisma.team.findFirst).mockResolvedValue(null);

      await expect(
        TeamService.update('e1', 't1', 'o1', { name: 'Test' }),
      ).rejects.toThrow('Team not found in this event');
    });

    it('should reject taskId when uniqueTaskAssignment is enabled and task already assigned', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        ...mockEvent,
        uniqueTaskAssignment: true,
      } as any);
      // ensureTeamBelongsToEvent
      vi.mocked(prisma.team.findFirst).mockResolvedValueOnce({ id: 't1', eventId: 'e1' } as any);
      vi.mocked(prisma.task.findFirst).mockResolvedValue({ id: 'task1', eventId: 'e1' } as any);
      // Transaction: check finds existing assignment → throws conflict
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        const tx = {
          team: {
            findFirst: vi.fn().mockResolvedValue({ id: 't2', name: 'Beta', eventId: 'e1' }),
            update: vi.fn(),
          },
        };
        return cb(tx);
      });

      await expect(
        TeamService.update('e1', 't1', 'o1', { taskId: 'task1' }),
      ).rejects.toThrow('Task is already assigned to team "Beta"');
    });

    it('should allow taskId when uniqueTaskAssignment is disabled', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        ...mockEvent,
        uniqueTaskAssignment: false,
      } as any);
      vi.mocked(prisma.team.findFirst).mockResolvedValue({ id: 't1', eventId: 'e1' } as any);
      vi.mocked(prisma.task.findFirst).mockResolvedValue({ id: 'task1', eventId: 'e1' } as any);
      vi.mocked(prisma.team.update).mockResolvedValue({
        id: 't1',
        name: 'Alpha',
        taskId: 'task1',
        participants: [],
        task: { id: 'task1' },
      } as any);

      const result = await TeamService.update('e1', 't1', 'o1', { taskId: 'task1' });
      expect(result.taskId).toBe('task1');
    });
  });

  describe('delete', () => {
    it('should delete a team without evaluations', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      vi.mocked(prisma.team.findFirst).mockResolvedValue({
        id: 't1',
        eventId: 'e1',
      } as any);
      vi.mocked(prisma.teamEvaluation.count).mockResolvedValue(0);
      vi.mocked(prisma.team.delete).mockResolvedValue({} as any);

      await TeamService.delete('e1', 't1', 'o1');

      expect(prisma.team.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
    });

    it('should reject deletion when team has evaluations without force flag', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      vi.mocked(prisma.team.findFirst).mockResolvedValue({
        id: 't1',
        eventId: 'e1',
      } as any);
      vi.mocked(prisma.teamEvaluation.count).mockResolvedValue(3);

      await expect(TeamService.delete('e1', 't1', 'o1')).rejects.toThrow(
        'Team has existing evaluations',
      );
    });

    it('should force-delete a team with evaluations when force=true', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      vi.mocked(prisma.team.findFirst).mockResolvedValue({
        id: 't1',
        eventId: 'e1',
      } as any);
      vi.mocked(prisma.team.delete).mockResolvedValue({} as any);

      await TeamService.delete('e1', 't1', 'o1', true);

      expect(prisma.team.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
      // Should NOT check evaluationCount when force=true
      expect(prisma.teamEvaluation.count).not.toHaveBeenCalled();
    });
  });

  describe('addParticipant', () => {
    it('should add a participant to a team', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      vi.mocked(prisma.team.findFirst).mockResolvedValue({
        id: 't1',
        eventId: 'e1',
      } as any);
      vi.mocked(prisma.participant.count).mockResolvedValue(0);
      vi.mocked(prisma.participant.create).mockResolvedValue({
        id: 'p1',
        name: 'Alice',
        email: 'alice@test.com',
        teamId: 't1',
      } as any);

      const result = await TeamService.addParticipant('e1', 't1', 'o1', {
        name: 'Alice',
        email: 'alice@test.com',
      });

      expect(result.name).toBe('Alice');
    });

    it('should reject when max participants limit reached', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      vi.mocked(prisma.team.findFirst).mockResolvedValue({
        id: 't1',
        eventId: 'e1',
      } as any);
      vi.mocked(prisma.participant.count).mockResolvedValue(10);

      await expect(
        TeamService.addParticipant('e1', 't1', 'o1', {
          name: 'Bob',
          email: null,
        }),
      ).rejects.toThrow('Maximum 10 participants allowed per team');
    });
  });

  describe('updateParticipant', () => {
    it('should update a participant', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      vi.mocked(prisma.team.findFirst).mockResolvedValue({
        id: 't1',
        eventId: 'e1',
      } as any);
      vi.mocked(prisma.participant.findFirst).mockResolvedValue({
        id: 'p1',
        teamId: 't1',
      } as any);
      vi.mocked(prisma.participant.update).mockResolvedValue({
        id: 'p1',
        name: 'Alice Updated',
        email: null,
      } as any);

      const result = await TeamService.updateParticipant('e1', 't1', 'p1', 'o1', {
        name: 'Alice Updated',
      });

      expect(result.name).toBe('Alice Updated');
    });

    it('should throw not found for missing participant', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      vi.mocked(prisma.team.findFirst).mockResolvedValue({
        id: 't1',
        eventId: 'e1',
      } as any);
      vi.mocked(prisma.participant.findFirst).mockResolvedValue(null);

      await expect(
        TeamService.updateParticipant('e1', 't1', 'p1', 'o1', { name: 'Test' }),
      ).rejects.toThrow('Participant not found');
    });
  });

  describe('deleteParticipant', () => {
    it('should delete a participant', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      vi.mocked(prisma.team.findFirst).mockResolvedValue({
        id: 't1',
        eventId: 'e1',
      } as any);
      vi.mocked(prisma.participant.findFirst).mockResolvedValue({
        id: 'p1',
        teamId: 't1',
      } as any);
      vi.mocked(prisma.participant.delete).mockResolvedValue({} as any);

      await TeamService.deleteParticipant('e1', 't1', 'p1', 'o1');

      expect(prisma.participant.delete).toHaveBeenCalledWith({
        where: { id: 'p1' },
      });
    });
  });
});
