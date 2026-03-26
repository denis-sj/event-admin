import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DiplomaService } from '../diploma.service.js';

vi.mock('../../config.js', () => ({
  config: {
    JWT_SECRET: 'test_secret',
    UPLOAD_DIR: './uploads',
    BASE_URL: 'http://localhost:4321',
    TZ: 'Europe/Moscow',
  },
}));

vi.mock('../../prisma.js', () => {
  return {
    prisma: {
      event: {
        findUnique: vi.fn(),
      },
      diplomaSettings: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      diploma: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
      },
      team: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
      },
      criterion: {
        findMany: vi.fn(),
      },
    },
  };
});

// Mock nanoid
vi.mock('nanoid', () => ({
  nanoid: () => 'TESTCODE1234',
}));

describe('DiplomaService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getSettings', () => {
    it('should return existing settings', async () => {
      const { prisma } = await import('../../prisma.js');

      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        organizerId: 'org1',
      } as any);

      const settings = {
        id: 'ds1',
        eventId: 'e1',
        backgroundPath: null,
        primaryColor: '#1a365d',
        textColor: '#1a202c',
      };
      vi.mocked(prisma.diplomaSettings.findUnique).mockResolvedValue(settings as any);

      const result = await DiplomaService.getSettings('e1', 'org1');

      expect(result).toEqual(settings);
    });

    it('should create default settings if not exist', async () => {
      const { prisma } = await import('../../prisma.js');

      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        organizerId: 'org1',
      } as any);

      vi.mocked(prisma.diplomaSettings.findUnique).mockResolvedValue(null);

      const createdSettings = {
        id: 'ds1',
        eventId: 'e1',
        backgroundPath: null,
        primaryColor: '#1a365d',
        textColor: '#1a202c',
      };
      vi.mocked(prisma.diplomaSettings.create).mockResolvedValue(createdSettings as any);

      const result = await DiplomaService.getSettings('e1', 'org1');

      expect(result).toEqual(createdSettings);
      expect(prisma.diplomaSettings.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventId: 'e1',
          primaryColor: '#1a365d',
          textColor: '#1a202c',
        }),
      });
    });

    it('should throw if event not found', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(null);

      await expect(DiplomaService.getSettings('e1', 'org1')).rejects.toThrow('Event not found');
    });

    it('should throw if not owner', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        organizerId: 'other-org',
      } as any);

      await expect(DiplomaService.getSettings('e1', 'org1')).rejects.toThrow('Access denied');
    });
  });

  describe('updateSettings', () => {
    it('should update diploma colors', async () => {
      const { prisma } = await import('../../prisma.js');

      // verifyOwnership
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        organizerId: 'org1',
      } as any);

      // getSettings (ensure exists)
      vi.mocked(prisma.diplomaSettings.findUnique).mockResolvedValue({
        id: 'ds1',
        eventId: 'e1',
      } as any);

      const updated = {
        id: 'ds1',
        eventId: 'e1',
        backgroundPath: null,
        primaryColor: '#ff0000',
        textColor: '#00ff00',
      };
      vi.mocked(prisma.diplomaSettings.update).mockResolvedValue(updated as any);

      const result = await DiplomaService.updateSettings('e1', 'org1', {
        primaryColor: '#ff0000',
        textColor: '#00ff00',
      });

      expect(result.primaryColor).toBe('#ff0000');
    });
  });

  describe('verify', () => {
    it('should return diploma data for valid verification code', async () => {
      const { prisma } = await import('../../prisma.js');

      vi.mocked(prisma.diploma.findUnique).mockResolvedValue({
        id: 'd1',
        teamId: 't1',
        rank: 1,
        totalScore: 95,
        generatedAt: new Date('2025-01-01T12:00:00Z'),
        team: {
          name: 'Alpha',
          event: { id: 'e1', title: 'Ideathon 2025', date: new Date('2025-06-01T12:00:00Z') },
          participants: [{ name: 'Alice' }, { name: 'Bob' }],
          task: { title: 'Task 1' },
        },
      } as any);

      const result = await DiplomaService.verify('ABC123');

      expect(result.teamName).toBe('Alpha');
      expect(result.rank).toBe(1);
      expect(result.totalScore).toBe(95);
      expect(result.participants).toEqual(['Alice', 'Bob']);
      expect(result.taskTitle).toBe('Task 1');
      expect(result.eventDate).toBe('1 июня 2025');
      expect(result.generatedAt).toBe('1 января 2025');
    });

    it('should format near-midnight UTC dates using configured timezone', async () => {
      // Regression: organizer in UTC+3 enters "2025-06-01 00:30" local time.
      // Browser sends new Date('2025-06-01T00:30').toISOString() = '2025-05-31T21:30:00.000Z'.
      // With TZ=Europe/Moscow the diploma must show "1 июня 2025", not "31 мая 2025".
      const { prisma } = await import('../../prisma.js');

      vi.mocked(prisma.diploma.findUnique).mockResolvedValue({
        id: 'd2',
        teamId: 't2',
        rank: 2,
        totalScore: 88,
        generatedAt: new Date('2025-05-31T21:30:00.000Z'),
        team: {
          name: 'Beta',
          event: { id: 'e2', title: 'Night Ideathon', date: new Date('2025-05-31T21:30:00.000Z') },
          participants: [{ name: 'Charlie' }],
          task: null,
        },
      } as any);

      const result = await DiplomaService.verify('NIGHT123');

      // In Europe/Moscow (UTC+3), 2025-05-31T21:30Z = 2025-06-01T00:30 local
      expect(result.eventDate).toBe('1 июня 2025');
      expect(result.generatedAt).toBe('1 июня 2025');
    });

    it('should throw not found for invalid code', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.diploma.findUnique).mockResolvedValue(null);

      await expect(DiplomaService.verify('INVALID')).rejects.toThrow('Diploma not found');
    });
  });

  describe('generateAll', () => {
    it('should reject if event is not COMPLETED', async () => {
      const { prisma } = await import('../../prisma.js');

      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        organizerId: 'org1',
        status: 'ACTIVE',
        title: 'Test',
        date: new Date(),
        logoPath: null,
      } as any);

      await expect(
        DiplomaService.generateAll('e1', 'org1'),
      ).rejects.toThrow('Event must be completed before generating diplomas');
    });

    it('should reject if event not found', async () => {
      const { prisma } = await import('../../prisma.js');

      vi.mocked(prisma.event.findUnique).mockResolvedValue(null);

      await expect(
        DiplomaService.generateAll('e1', 'org1'),
      ).rejects.toThrow('Event not found');
    });

    it('should reject if not owner', async () => {
      const { prisma } = await import('../../prisma.js');

      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        organizerId: 'other-org',
        status: 'COMPLETED',
        title: 'Test',
        date: new Date(),
        logoPath: null,
      } as any);

      await expect(
        DiplomaService.generateAll('e1', 'org1'),
      ).rejects.toThrow('Access denied');
    });
  });

  describe('getDiplomaForTeam', () => {
    it('should return diploma for a team', async () => {
      const { prisma } = await import('../../prisma.js');

      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        organizerId: 'org1',
      } as any);

      vi.mocked(prisma.diploma.findUnique).mockResolvedValue({
        id: 'd1',
        teamId: 't1',
        verificationCode: 'ABC123',
        rank: 1,
        totalScore: 95,
        team: { name: 'Alpha', eventId: 'e1' },
      } as any);

      const result = await DiplomaService.getDiplomaForTeam('e1', 'org1', 't1');

      expect(result.verificationCode).toBe('ABC123');
    });

    it('should throw not found if diploma does not exist', async () => {
      const { prisma } = await import('../../prisma.js');

      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        organizerId: 'org1',
      } as any);

      vi.mocked(prisma.diploma.findUnique).mockResolvedValue(null);

      await expect(
        DiplomaService.getDiplomaForTeam('e1', 'org1', 't1'),
      ).rejects.toThrow('Diploma not found');
    });

    it('should throw not found if diploma belongs to different event', async () => {
      const { prisma } = await import('../../prisma.js');

      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        organizerId: 'org1',
      } as any);

      vi.mocked(prisma.diploma.findUnique).mockResolvedValue({
        id: 'd1',
        teamId: 't1',
        team: { name: 'Alpha', eventId: 'other-event' },
      } as any);

      await expect(
        DiplomaService.getDiplomaForTeam('e1', 'org1', 't1'),
      ).rejects.toThrow('Diploma not found');
    });
  });
});
