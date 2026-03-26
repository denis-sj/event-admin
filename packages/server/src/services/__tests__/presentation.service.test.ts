import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PresentationService } from '../presentation.service.js';

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
        update: vi.fn(),
      },
      team: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  };
});

describe('PresentationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const mockEvent = {
    id: 'e1',
    organizerId: 'o1',
    status: 'ACTIVE',
    currentTeamId: 't1',
    scoringTeamId: null,
    timerDuration: 300,
  };

  describe('setPresentationOrder', () => {
    it('should set presentation order for teams', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      vi.mocked(prisma.team.findMany).mockResolvedValueOnce([
        { id: 't1' },
        { id: 't2' },
        { id: 't3' },
      ] as any);
      vi.mocked(prisma.$transaction).mockResolvedValue([]);
      vi.mocked(prisma.team.findMany).mockResolvedValueOnce([
        { id: 't2', name: 'Beta', presentationOrder: 1 },
        { id: 't1', name: 'Alpha', presentationOrder: 2 },
        { id: 't3', name: 'Gamma', presentationOrder: 3 },
      ] as any);

      const result = await PresentationService.setPresentationOrder('e1', 'o1', {
        teamIds: ['t2', 't1', 't3'],
      });

      expect(result).toHaveLength(3);
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should reject when team not in event', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      vi.mocked(prisma.team.findMany).mockResolvedValueOnce([
        { id: 't1' },
        { id: 't2' },
      ] as any);

      await expect(
        PresentationService.setPresentationOrder('e1', 'o1', {
          teamIds: ['t1', 'nonexistent'],
        }),
      ).rejects.toThrow('Team nonexistent not found in this event');
    });
  });

  describe('setCurrentTeam', () => {
    it('should set current team and broadcast', async () => {
      const { prisma } = await import('../../prisma.js');
      const { Broadcaster } = await import('../../ws/broadcaster.js');

      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      vi.mocked(prisma.team.findFirst).mockResolvedValue({ id: 't2', eventId: 'e1' } as any);
      vi.mocked(prisma.event.update).mockResolvedValue({
        ...mockEvent,
        currentTeamId: 't2',
        scoringTeamId: null,
      } as any);
      vi.mocked(prisma.team.findUnique).mockResolvedValue({
        id: 't2',
        name: 'Beta',
        participants: [],
        task: null,
      } as any);

      const result = await PresentationService.setCurrentTeam('e1', 'o1', 't2');

      expect(result.currentTeamId).toBe('t2');
      expect(Broadcaster.broadcastToEvent).toHaveBeenCalledWith(
        'e1',
        'team:current',
        expect.objectContaining({ team: expect.objectContaining({ id: 't2' }) }),
      );
      expect(Broadcaster.broadcastToEvent).toHaveBeenCalledWith(
        'e1',
        'scoring:status',
        { scoringTeamId: null, isOpen: false },
      );
    });

    it('should clear current team when teamId is null', async () => {
      const { prisma } = await import('../../prisma.js');
      const { Broadcaster } = await import('../../ws/broadcaster.js');

      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      vi.mocked(prisma.event.update).mockResolvedValue({
        ...mockEvent,
        currentTeamId: null,
        scoringTeamId: null,
      } as any);

      const result = await PresentationService.setCurrentTeam('e1', 'o1', null);

      expect(result.currentTeamId).toBeNull();
      expect(Broadcaster.broadcastToEvent).toHaveBeenCalledWith(
        'e1',
        'team:current',
        { team: null },
      );
    });

    it('should reject when event is not active', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        ...mockEvent,
        status: 'DRAFT',
      } as any);

      await expect(
        PresentationService.setCurrentTeam('e1', 'o1', 't1'),
      ).rejects.toThrow('Event must be ACTIVE or SCORING_CLOSED');
    });

    it('should reject when team not found in event', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      vi.mocked(prisma.team.findFirst).mockResolvedValue(null);

      await expect(
        PresentationService.setCurrentTeam('e1', 'o1', 't99'),
      ).rejects.toThrow('Team not found in this event');
    });
  });

  describe('timerAction', () => {
    it('should start timer and broadcast state', async () => {
      const { prisma } = await import('../../prisma.js');
      const { Broadcaster } = await import('../../ws/broadcaster.js');

      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);

      const result = await PresentationService.timerAction('e1', 'o1', 'start');

      expect(result.isRunning).toBe(true);
      expect(result.duration).toBe(300);
      expect(result.remaining).toBe(300);
      expect(Broadcaster.broadcastToEvent).toHaveBeenCalledWith(
        'e1',
        'timer:state',
        expect.objectContaining({ isRunning: true }),
      );

      // Cleanup: reset to stop interval
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      await PresentationService.timerAction('e1', 'o1', 'reset');
    });

    it('should pause a running timer', async () => {
      const { prisma } = await import('../../prisma.js');

      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      await PresentationService.timerAction('e1', 'o1', 'start');

      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      const result = await PresentationService.timerAction('e1', 'o1', 'pause');

      expect(result.isRunning).toBe(false);
      expect(result.remaining).toBe(300);

      // Cleanup
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      await PresentationService.timerAction('e1', 'o1', 'reset');
    });

    it('should reset timer to full duration', async () => {
      const { prisma } = await import('../../prisma.js');
      const { Broadcaster } = await import('../../ws/broadcaster.js');

      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      await PresentationService.timerAction('e1', 'o1', 'start');

      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      const result = await PresentationService.timerAction('e1', 'o1', 'reset');

      expect(result.isRunning).toBe(false);
      expect(result.remaining).toBe(300);
      expect(result.duration).toBe(300);
      expect(Broadcaster.broadcastToEvent).toHaveBeenCalledWith(
        'e1',
        'timer:state',
        expect.objectContaining({ isRunning: false, remaining: 300 }),
      );
    });

    it('should decrement timer every second when running', async () => {
      const { prisma } = await import('../../prisma.js');

      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      await PresentationService.timerAction('e1', 'o1', 'start');

      // Advance 3 seconds
      vi.advanceTimersByTime(3000);

      // Timer should have decremented 3 times
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      const timerState = await PresentationService.getTimerState('e1', 'o1');
      expect(timerState!.remaining).toBe(297);

      // Cleanup
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      await PresentationService.timerAction('e1', 'o1', 'reset');
    });
  });

  describe('getTimerState', () => {
    it('should return null when no timer exists', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        ...mockEvent,
        id: 'e-no-timer',
      } as any);
      const state = await PresentationService.getTimerState('e-no-timer', 'o1');
      expect(state).toBeNull();
    });

    it('should reject when organizer does not own event', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        ...mockEvent,
        organizerId: 'other',
      } as any);

      await expect(
        PresentationService.getTimerState('e1', 'o1'),
      ).rejects.toThrow('Access denied');
    });
  });

  describe('setScoringStatus', () => {
    it('should open scoring for current team', async () => {
      const { prisma } = await import('../../prisma.js');
      const { Broadcaster } = await import('../../ws/broadcaster.js');

      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      vi.mocked(prisma.event.update).mockResolvedValue({
        ...mockEvent,
        scoringTeamId: 't1',
      } as any);

      const result = await PresentationService.setScoringStatus('e1', 'o1', true);

      expect(result.isOpen).toBe(true);
      expect(result.scoringTeamId).toBe('t1');
      expect(Broadcaster.broadcastToEvent).toHaveBeenCalledWith(
        'e1',
        'scoring:status',
        { scoringTeamId: 't1', isOpen: true },
      );
    });

    it('should close scoring', async () => {
      const { prisma } = await import('../../prisma.js');
      const { Broadcaster } = await import('../../ws/broadcaster.js');

      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        ...mockEvent,
        scoringTeamId: 't1',
      } as any);
      vi.mocked(prisma.event.update).mockResolvedValue({
        ...mockEvent,
        scoringTeamId: null,
      } as any);

      const result = await PresentationService.setScoringStatus('e1', 'o1', false);

      expect(result.isOpen).toBe(false);
      expect(result.scoringTeamId).toBeNull();
      expect(Broadcaster.broadcastToEvent).toHaveBeenCalledWith(
        'e1',
        'scoring:status',
        { scoringTeamId: null, isOpen: false },
      );
    });

    it('should reject when event is not active', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        ...mockEvent,
        status: 'DRAFT',
      } as any);

      await expect(
        PresentationService.setScoringStatus('e1', 'o1', true),
      ).rejects.toThrow('Event must be ACTIVE to control scoring');
    });

    it('should reject opening scoring when no current team', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        ...mockEvent,
        currentTeamId: null,
      } as any);

      await expect(
        PresentationService.setScoringStatus('e1', 'o1', true),
      ).rejects.toThrow('No current team set');
    });
  });

  describe('cleanupTimer', () => {
    it('should cleanup timer and broadcast final stopped state', async () => {
      const { prisma } = await import('../../prisma.js');
      const { Broadcaster } = await import('../../ws/broadcaster.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);

      // Start a timer first
      await PresentationService.timerAction('e1', 'o1', 'start');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      const stateBefore = await PresentationService.getTimerState('e1', 'o1');
      expect(stateBefore).not.toBeNull();

      vi.mocked(Broadcaster.broadcastToEvent).mockClear();
      PresentationService.cleanupTimer('e1');

      // Should broadcast a final timer:state with isRunning: false
      expect(Broadcaster.broadcastToEvent).toHaveBeenCalledWith(
        'e1',
        'timer:state',
        expect.objectContaining({ isRunning: false }),
      );

      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      const stateAfter = await PresentationService.getTimerState('e1', 'o1');
      expect(stateAfter).toBeNull();
    });

    it('should be a no-op when no timer exists', async () => {
      const { Broadcaster } = await import('../../ws/broadcaster.js');
      vi.mocked(Broadcaster.broadcastToEvent).mockClear();

      PresentationService.cleanupTimer('nonexistent-event');

      // Should NOT broadcast anything
      expect(Broadcaster.broadcastToEvent).not.toHaveBeenCalled();
    });
  });
});
