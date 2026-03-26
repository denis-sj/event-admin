import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventService } from '../event.service.js';

vi.mock('../../config.js', () => ({
  config: { JWT_SECRET: 'test_secret', UPLOAD_DIR: './uploads' },
}));

vi.mock('../../ws/broadcaster.js', () => ({
  Broadcaster: {
    broadcastToEvent: vi.fn(),
    broadcastToJury: vi.fn(),
    broadcastToOrganizer: vi.fn(),
  },
}));

vi.mock('../presentation.service.js', () => ({
  PresentationService: {
    cleanupTimer: vi.fn(),
  },
}));

vi.mock('../../prisma.js', () => {
  return {
    prisma: {
      event: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
    },
  };
});

describe('EventService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('should return events for the organizer', async () => {
      const { prisma } = await import('../../prisma.js');
      const mockEvents = [
        { id: 'e1', title: 'Event 1', organizerId: 'o1', _count: { teams: 2, criteria: 3, tasks: 1, juryMembers: 2 } },
      ];
      vi.mocked(prisma.event.findMany).mockResolvedValue(mockEvents as any);

      const result = await EventService.list('o1');

      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizerId: 'o1' },
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(result).toEqual(mockEvents);
    });
  });

  describe('getById', () => {
    it('should return event if found and owned by organizer', async () => {
      const { prisma } = await import('../../prisma.js');
      const mockEvent = { id: 'e1', organizerId: 'o1', title: 'Test' };
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);

      const result = await EventService.getById('e1', 'o1');
      expect(result).toEqual(mockEvent);
    });

    it('should throw not found if event does not exist', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(null);

      await expect(EventService.getById('e1', 'o1')).rejects.toThrow('Event not found');
    });

    it('should throw forbidden if organizer does not own the event', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'e1',
        organizerId: 'other-organizer',
      } as any);

      await expect(EventService.getById('e1', 'o1')).rejects.toThrow('Access denied');
    });
  });

  describe('create', () => {
    it('should create an event', async () => {
      const { prisma } = await import('../../prisma.js');
      const mockEvent = { id: 'e1', title: 'New Event', organizerId: 'o1' };
      vi.mocked(prisma.event.create).mockResolvedValue(mockEvent as any);

      const result = await EventService.create('o1', {
        title: 'New Event',
        description: 'Test',
        date: '2025-06-01T10:00:00.000Z',
        timerDuration: 300,
        uniqueTaskAssignment: false,
      });

      expect(prisma.event.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizerId: 'o1',
          title: 'New Event',
          description: 'Test',
        }),
      });
      expect(result).toEqual(mockEvent);
    });
  });

  describe('updateStatus', () => {
    it('should allow DRAFT → ACTIVE', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'e1',
        organizerId: 'o1',
        status: 'DRAFT',
      } as any);
      vi.mocked(prisma.event.update).mockResolvedValue({
        id: 'e1',
        status: 'ACTIVE',
      } as any);

      const result = await EventService.updateStatus('e1', 'o1', 'ACTIVE');
      expect(result.status).toBe('ACTIVE');
    });

    it('should allow ACTIVE → SCORING_CLOSED and run side-effects after persist', async () => {
      const { prisma } = await import('../../prisma.js');
      const { Broadcaster } = await import('../../ws/broadcaster.js');
      const { PresentationService } = await import('../presentation.service.js');

      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'e1',
        organizerId: 'o1',
        status: 'ACTIVE',
      } as any);

      vi.mocked(prisma.event.update).mockResolvedValue({
        id: 'e1',
        status: 'SCORING_CLOSED',
      } as any);
      vi.mocked(PresentationService.cleanupTimer).mockImplementation(() => {
        // When cleanup runs, update must have already been called
        expect(prisma.event.update).toHaveBeenCalled();
      });
      vi.mocked(Broadcaster.broadcastToEvent).mockImplementation(() => {
        // When broadcast runs, update must have already been called
        expect(prisma.event.update).toHaveBeenCalled();
      });

      const result = await EventService.updateStatus('e1', 'o1', 'SCORING_CLOSED');
      expect(result.status).toBe('SCORING_CLOSED');
      expect(PresentationService.cleanupTimer).toHaveBeenCalledWith('e1');
      expect(Broadcaster.broadcastToEvent).toHaveBeenCalled();
    });

    it('should allow SCORING_CLOSED → COMPLETED', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'e1',
        organizerId: 'o1',
        status: 'SCORING_CLOSED',
      } as any);
      vi.mocked(prisma.event.update).mockResolvedValue({
        id: 'e1',
        status: 'COMPLETED',
      } as any);

      const result = await EventService.updateStatus('e1', 'o1', 'COMPLETED');
      expect(result.status).toBe('COMPLETED');
    });

    it('should allow SCORING_CLOSED → ACTIVE (reopen)', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'e1',
        organizerId: 'o1',
        status: 'SCORING_CLOSED',
      } as any);
      vi.mocked(prisma.event.update).mockResolvedValue({
        id: 'e1',
        status: 'ACTIVE',
      } as any);

      const result = await EventService.updateStatus('e1', 'o1', 'ACTIVE');
      expect(result.status).toBe('ACTIVE');
    });

    it('should reject DRAFT → COMPLETED', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'e1',
        organizerId: 'o1',
        status: 'DRAFT',
      } as any);

      await expect(
        EventService.updateStatus('e1', 'o1', 'COMPLETED'),
      ).rejects.toThrow('Cannot transition from DRAFT to COMPLETED');
    });

    it('should reject COMPLETED → any', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'e1',
        organizerId: 'o1',
        status: 'COMPLETED',
      } as any);

      await expect(
        EventService.updateStatus('e1', 'o1', 'DRAFT'),
      ).rejects.toThrow('Cannot transition from COMPLETED to DRAFT');
    });

    it('should reject ACTIVE → DRAFT', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'e1',
        organizerId: 'o1',
        status: 'ACTIVE',
      } as any);

      await expect(
        EventService.updateStatus('e1', 'o1', 'DRAFT'),
      ).rejects.toThrow('Cannot transition from ACTIVE to DRAFT');
    });
  });

  describe('update', () => {
    it('should update event fields', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'e1',
        organizerId: 'o1',
      } as any);
      vi.mocked(prisma.event.update).mockResolvedValue({
        id: 'e1',
        title: 'Updated',
      } as any);

      const result = await EventService.update('e1', 'o1', { title: 'Updated' });
      expect(result.title).toBe('Updated');
    });

    it('should throw not found for non-existent event', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(null);

      await expect(
        EventService.update('e1', 'o1', { title: 'Updated' }),
      ).rejects.toThrow('Event not found');
    });
  });

  describe('uploadLogo', () => {
    it('should update logo path', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'e1',
        organizerId: 'o1',
      } as any);
      vi.mocked(prisma.event.update).mockResolvedValue({
        id: 'e1',
        logoPath: '/uploads/logos/test.png',
      } as any);

      const result = await EventService.uploadLogo('e1', 'o1', '/uploads/logos/test.png');
      expect(result.logoPath).toBe('/uploads/logos/test.png');
    });
  });
});
