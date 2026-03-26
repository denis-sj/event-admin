import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskService } from '../task.service.js';

vi.mock('../../config.js', () => ({
  config: { JWT_SECRET: 'test_secret' },
}));

vi.mock('../../prisma.js', () => {
  return {
    prisma: {
      event: {
        findUnique: vi.fn(),
      },
      task: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },
      team: {
        findFirst: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  };
});

describe('TaskService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('should return tasks with assigned teams', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'e1',
        organizerId: 'o1',
        uniqueTaskAssignment: false,
      } as any);
      const mockTasks = [
        { id: 't1', title: 'Task 1', teams: [{ id: 'team1', name: 'Alpha' }] },
      ];
      vi.mocked(prisma.task.findMany).mockResolvedValue(mockTasks as any);

      const result = await TaskService.list('e1', 'o1');
      expect(result).toEqual(mockTasks);
    });
  });

  describe('create', () => {
    it('should create a task', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'e1',
        organizerId: 'o1',
        uniqueTaskAssignment: false,
      } as any);
      vi.mocked(prisma.task.count).mockResolvedValue(0);
      vi.mocked(prisma.task.create).mockResolvedValue({
        id: 't1',
        title: 'New Task',
        difficulty: 'MEDIUM',
      } as any);

      const result = await TaskService.create('e1', 'o1', {
        title: 'New Task',
        description: null,
        difficulty: 'MEDIUM',
      });

      expect(result.title).toBe('New Task');
    });

    it('should reject when max tasks limit reached', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'e1',
        organizerId: 'o1',
        uniqueTaskAssignment: false,
      } as any);
      vi.mocked(prisma.task.count).mockResolvedValue(30);

      await expect(
        TaskService.create('e1', 'o1', {
          title: 'Task',
          description: null,
          difficulty: 'MEDIUM',
        }),
      ).rejects.toThrow('Maximum 30 tasks allowed per event');
    });
  });

  describe('update', () => {
    it('should update task fields', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'e1',
        organizerId: 'o1',
        uniqueTaskAssignment: false,
      } as any);
      vi.mocked(prisma.task.findFirst).mockResolvedValue({
        id: 't1',
        eventId: 'e1',
      } as any);
      vi.mocked(prisma.task.update).mockResolvedValue({
        id: 't1',
        title: 'Updated',
        difficulty: 'HIGH',
      } as any);

      const result = await TaskService.update('e1', 't1', 'o1', {
        title: 'Updated',
        difficulty: 'HIGH',
      });

      expect(result.title).toBe('Updated');
    });

    it('should throw not found for non-existent task', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'e1',
        organizerId: 'o1',
        uniqueTaskAssignment: false,
      } as any);
      vi.mocked(prisma.task.findFirst).mockResolvedValue(null);

      await expect(
        TaskService.update('e1', 't1', 'o1', { title: 'Test' }),
      ).rejects.toThrow('Task not found');
    });
  });

  describe('delete', () => {
    it('should delete a task and unassign from teams', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'e1',
        organizerId: 'o1',
        uniqueTaskAssignment: false,
      } as any);
      vi.mocked(prisma.task.findFirst).mockResolvedValue({
        id: 't1',
        eventId: 'e1',
      } as any);
      vi.mocked(prisma.team.updateMany).mockResolvedValue({ count: 1 } as any);
      vi.mocked(prisma.task.delete).mockResolvedValue({} as any);

      await TaskService.delete('e1', 't1', 'o1');

      expect(prisma.team.updateMany).toHaveBeenCalledWith({
        where: { taskId: 't1' },
        data: { taskId: null },
      });
      expect(prisma.task.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
    });
  });

  describe('assignTask', () => {
    it('should assign a task to a team', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'e1',
        organizerId: 'o1',
        uniqueTaskAssignment: false,
      } as any);
      vi.mocked(prisma.team.findFirst).mockResolvedValue({
        id: 'team1',
        eventId: 'e1',
      } as any);
      vi.mocked(prisma.task.findFirst).mockResolvedValue({
        id: 't1',
        eventId: 'e1',
      } as any);
      vi.mocked(prisma.team.update).mockResolvedValue({
        id: 'team1',
        taskId: 't1',
        task: { id: 't1', title: 'Task 1' },
      } as any);

      const result = await TaskService.assignTask('e1', 'o1', {
        teamId: 'team1',
        taskId: 't1',
      });

      expect(result.taskId).toBe('t1');
    });

    it('should unassign a task from a team (taskId = null)', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'e1',
        organizerId: 'o1',
        uniqueTaskAssignment: false,
      } as any);
      vi.mocked(prisma.team.findFirst).mockResolvedValue({
        id: 'team1',
        eventId: 'e1',
      } as any);
      vi.mocked(prisma.team.update).mockResolvedValue({
        id: 'team1',
        taskId: null,
        task: null,
      } as any);

      const result = await TaskService.assignTask('e1', 'o1', {
        teamId: 'team1',
        taskId: null,
      });

      expect(result.taskId).toBeNull();
    });

    it('should reject unique assignment when task already assigned', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'e1',
        organizerId: 'o1',
        uniqueTaskAssignment: true,
      } as any);
      vi.mocked(prisma.team.findFirst).mockResolvedValue({
        id: 'team1',
        eventId: 'e1',
      } as any);
      vi.mocked(prisma.task.findFirst).mockResolvedValue({
        id: 't1',
        eventId: 'e1',
      } as any);
      // $transaction receives a callback; execute it with a tx mock that returns existing assignment
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        const tx = {
          team: {
            findFirst: vi.fn().mockResolvedValue({ id: 'team2', name: 'Beta', eventId: 'e1', taskId: 't1' }),
            update: vi.fn(),
          },
        };
        return cb(tx);
      });

      await expect(
        TaskService.assignTask('e1', 'o1', {
          teamId: 'team1',
          taskId: 't1',
        }),
      ).rejects.toThrow('Task is already assigned to team "Beta"');
    });

    it('should allow reassignment to same team with unique constraint', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'e1',
        organizerId: 'o1',
        uniqueTaskAssignment: true,
      } as any);
      vi.mocked(prisma.team.findFirst).mockResolvedValue({
        id: 'team1',
        eventId: 'e1',
      } as any);
      vi.mocked(prisma.task.findFirst).mockResolvedValue({
        id: 't1',
        eventId: 'e1',
      } as any);
      // $transaction: no existing assignment, update succeeds
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        const tx = {
          team: {
            findFirst: vi.fn().mockResolvedValue(null),
            update: vi.fn().mockResolvedValue({
              id: 'team1',
              taskId: 't1',
              task: { id: 't1', title: 'Task 1' },
            }),
          },
        };
        return cb(tx);
      });

      const result = await TaskService.assignTask('e1', 'o1', {
        teamId: 'team1',
        taskId: 't1',
      });

      expect(result.taskId).toBe('t1');
    });

    it('should throw not found when team is not in event', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'e1',
        organizerId: 'o1',
        uniqueTaskAssignment: false,
      } as any);
      vi.mocked(prisma.team.findFirst).mockResolvedValue(null);

      await expect(
        TaskService.assignTask('e1', 'o1', {
          teamId: 'team-not-exist',
          taskId: 't1',
        }),
      ).rejects.toThrow('Team not found in this event');
    });

    it('should throw not found when task is not in event', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'e1',
        organizerId: 'o1',
        uniqueTaskAssignment: false,
      } as any);
      vi.mocked(prisma.team.findFirst).mockResolvedValue({
        id: 'team1',
        eventId: 'e1',
      } as any);
      vi.mocked(prisma.task.findFirst).mockResolvedValue(null);

      await expect(
        TaskService.assignTask('e1', 'o1', {
          teamId: 'team1',
          taskId: 'task-not-exist',
        }),
      ).rejects.toThrow('Task not found in this event');
    });
  });
});
