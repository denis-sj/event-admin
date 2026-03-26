import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as XLSX from 'xlsx';
import { ImportService } from '../import.service.js';

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
        create: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
      },
      participant: {
        create: vi.fn(),
        update: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  };
});

const mockEvent = { id: 'e1', organizerId: 'o1', status: 'DRAFT' };

describe('ImportService', () => {
  let tmpDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    ImportService._clearCache();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'import-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('preview', () => {
    it('should parse a CSV file and return headers, preview rows, suggested mapping, and existing teams', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      vi.mocked(prisma.team.findMany).mockResolvedValue([
        { id: 't1', name: 'Alpha' },
      ] as any);

      const csvContent = 'Команда,Участник,Email,Описание проекта\nAlpha,Alice,alice@test.com,Cool project\nAlpha,Bob,bob@test.com,Cool project\nBeta,Carol,,Another project';
      const csvPath = path.join(tmpDir, 'test.csv');
      fs.writeFileSync(csvPath, csvContent, 'utf-8');

      const result = await ImportService.preview('e1', 'o1', csvPath, 'test.csv');

      expect(result.headers).toEqual(['Команда', 'Участник', 'Email', 'Описание проекта']);
      expect(result.totalRows).toBe(3);
      expect(result.previewRows).toHaveLength(3);
      expect(result.fileId).toBeTruthy();
      expect(result.existingTeams).toEqual([{ id: 't1', name: 'Alpha' }]);
      // Check auto-detection
      expect(result.suggestedMapping.teamName).toBe(0); // "Команда"
      expect(result.suggestedMapping.participantName).toBe(1); // "Участник"
      expect(result.suggestedMapping.participantEmail).toBe(2); // "Email"
      expect(result.suggestedMapping.projectDescription).toBe(3); // "Описание проекта"
    });

    it('should parse an XLSX file', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      vi.mocked(prisma.team.findMany).mockResolvedValue([]);

      // Create a simple XLSX file
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([
        ['Team Name', 'Name', 'Email'],
        ['Alpha', 'Alice', 'alice@test.com'],
        ['Beta', 'Bob', 'bob@test.com'],
      ]);
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      const xlsxPath = path.join(tmpDir, 'test.xlsx');
      XLSX.writeFile(wb, xlsxPath);

      const result = await ImportService.preview('e1', 'o1', xlsxPath, 'test.xlsx');

      expect(result.headers).toEqual(['Team Name', 'Name', 'Email']);
      expect(result.totalRows).toBe(2);
      expect(result.suggestedMapping.teamName).toBe(0); // "Team Name"
      expect(result.suggestedMapping.participantName).toBe(1); // "Name"
      expect(result.suggestedMapping.participantEmail).toBe(2); // "Email"
    });

    it('should reject unsupported file formats', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      vi.mocked(prisma.team.findMany).mockResolvedValue([]);

      const txtPath = path.join(tmpDir, 'test.txt');
      fs.writeFileSync(txtPath, 'hello', 'utf-8');

      await expect(
        ImportService.preview('e1', 'o1', txtPath, 'test.txt'),
      ).rejects.toThrow('Unsupported file format');
    });

    it('should reject empty CSV files', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      vi.mocked(prisma.team.findMany).mockResolvedValue([]);

      const csvPath = path.join(tmpDir, 'empty.csv');
      fs.writeFileSync(csvPath, '', 'utf-8');

      await expect(
        ImportService.preview('e1', 'o1', csvPath, 'empty.csv'),
      ).rejects.toThrow();
    });
  });

  describe('apply', () => {
    it('should create new teams and participants from cached data', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);

      // Manually populate the cache
      const cache = ImportService._getCache();
      cache.set('file123', {
        headers: ['Team', 'Name', 'Email'],
        rows: [
          ['Alpha', 'Alice', 'alice@test.com'],
          ['Alpha', 'Bob', 'bob@test.com'],
          ['Beta', 'Carol', 'carol@test.com'],
        ],
        createdAt: Date.now(),
      });

      vi.mocked(prisma.team.count).mockResolvedValue(0);
      vi.mocked(prisma.team.findMany).mockResolvedValue([]);

      // Mock transaction to just execute the callback
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        const tx = {
          team: {
            create: vi.fn()
              .mockResolvedValueOnce({ id: 'new-t1', name: 'Alpha', eventId: 'e1' })
              .mockResolvedValueOnce({ id: 'new-t2', name: 'Beta', eventId: 'e1' }),
            update: vi.fn(),
          },
          participant: {
            create: vi.fn().mockResolvedValue({ id: 'p1' }),
          },
        };
        return cb(tx);
      });

      const result = await ImportService.apply('e1', 'o1', {
        fileId: 'file123',
        mapping: {
          teamName: 0,
          participantName: 1,
          participantEmail: 2,
          projectDescription: null,
        },

      });

      expect(result.teamsCreated).toBe(2);
      expect(result.teamsUpdated).toBe(0);
      expect(result.createdTeams).toContain('Alpha');
      expect(result.createdTeams).toContain('Beta');
    });

    it('should update existing teams on re-import', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);

      const cache = ImportService._getCache();
      cache.set('file456', {
        headers: ['Team', 'Name', 'Email'],
        rows: [
          ['Alpha', 'Dave', 'dave@test.com'],
        ],
        createdAt: Date.now(),
      });

      vi.mocked(prisma.team.count).mockResolvedValue(1);
      vi.mocked(prisma.team.findMany).mockResolvedValue([
        {
          id: 'existing-t1',
          name: 'Alpha',
          eventId: 'e1',
          participants: [{ id: 'p1', name: 'Alice', email: 'alice@test.com' }],
        },
      ] as any);

      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        const tx = {
          team: {
            create: vi.fn(),
            update: vi.fn().mockResolvedValue({}),
          },
          participant: {
            create: vi.fn().mockResolvedValue({ id: 'p2' }),
          },
        };
        return cb(tx);
      });

      const result = await ImportService.apply('e1', 'o1', {
        fileId: 'file456',
        mapping: {
          teamName: 0,
          participantName: 1,
          participantEmail: 2,
          projectDescription: null,
        },

      });

      expect(result.teamsCreated).toBe(0);
      expect(result.teamsUpdated).toBe(1);
      expect(result.updatedTeams).toContain('Alpha');
    });

    it('should reject when fileId not found in cache', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);

      await expect(
        ImportService.apply('e1', 'o1', {
          fileId: 'non-existent',
          mapping: {
            teamName: 0,
            participantName: 1,
            participantEmail: null,
            projectDescription: null,
          },
  
        }),
      ).rejects.toThrow('Import file not found or expired');
    });

    it('should reject when import would exceed team limit', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);

      const cache = ImportService._getCache();
      cache.set('file789', {
        headers: ['Team', 'Name'],
        rows: [['NewTeam', 'Person']],
        createdAt: Date.now(),
      });

      vi.mocked(prisma.team.count).mockResolvedValue(50);
      vi.mocked(prisma.team.findMany).mockResolvedValue([]);

      await expect(
        ImportService.apply('e1', 'o1', {
          fileId: 'file789',
          mapping: {
            teamName: 0,
            participantName: 1,
            participantEmail: null,
            projectDescription: null,
          },
  
        }),
      ).rejects.toThrow('Import would exceed the maximum of 50 teams');
    });

    it('should update email of existing participant and add new ones on re-import', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);

      const cache = ImportService._getCache();
      cache.set('file-dup', {
        headers: ['Team', 'Name', 'Email'],
        rows: [
          ['Alpha', 'Alice', 'alice-new@test.com'], // already exists, email changed
          ['Alpha', 'Bob', 'bob@test.com'],          // new
        ],
        createdAt: Date.now(),
      });

      vi.mocked(prisma.team.count).mockResolvedValue(1);
      vi.mocked(prisma.team.findMany).mockResolvedValue([
        {
          id: 't1',
          name: 'Alpha',
          eventId: 'e1',
          participants: [{ id: 'p1', name: 'Alice', email: 'alice@test.com' }],
        },
      ] as any);

      const participantCreateMock = vi.fn().mockResolvedValue({ id: 'p2' });
      const participantUpdateMock = vi.fn().mockResolvedValue({});
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        const tx = {
          team: {
            create: vi.fn(),
            update: vi.fn().mockResolvedValue({}),
          },
          participant: {
            create: participantCreateMock,
            update: participantUpdateMock,
          },
        };
        return cb(tx);
      });

      const result = await ImportService.apply('e1', 'o1', {
        fileId: 'file-dup',
        mapping: {
          teamName: 0,
          participantName: 1,
          participantEmail: 2,
          projectDescription: null,
        },

      });

      // Alice's email should be updated
      expect(participantUpdateMock).toHaveBeenCalledTimes(1);
      expect(participantUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'p1' },
          data: { email: 'alice-new@test.com' },
        }),
      );
      // Bob should be created
      expect(participantCreateMock).toHaveBeenCalledTimes(1);
      expect(participantCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: 'Bob' }),
        }),
      );
      expect(result.teamsUpdated).toBe(1);
    });

    it('should skip empty rows', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);

      const cache = ImportService._getCache();
      cache.set('file-empty', {
        headers: ['Team', 'Name'],
        rows: [
          ['Alpha', 'Alice'],
          ['', ''],         // empty row - should be skipped
          ['Alpha', ''],    // no participant name - should be skipped
        ],
        createdAt: Date.now(),
      });

      vi.mocked(prisma.team.count).mockResolvedValue(0);
      vi.mocked(prisma.team.findMany).mockResolvedValue([]);

      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        const tx = {
          team: {
            create: vi.fn().mockResolvedValue({ id: 'new-t1', name: 'Alpha', eventId: 'e1' }),
            update: vi.fn(),
          },
          participant: {
            create: vi.fn().mockResolvedValue({ id: 'p1' }),
          },
        };
        return cb(tx);
      });

      const result = await ImportService.apply('e1', 'o1', {
        fileId: 'file-empty',
        mapping: {
          teamName: 0,
          participantName: 1,
          participantEmail: null,
          projectDescription: null,
        },

      });

      expect(result.teamsCreated).toBe(1);
    });

    it('should deduplicate participants within new teams from same file', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);

      const cache = ImportService._getCache();
      cache.set('file-dedup', {
        headers: ['Team', 'Name'],
        rows: [
          ['Alpha', 'Alice'],
          ['Alpha', 'alice'], // duplicate (case-insensitive)
          ['Alpha', 'Bob'],
        ],
        createdAt: Date.now(),
      });

      vi.mocked(prisma.team.count).mockResolvedValue(0);
      vi.mocked(prisma.team.findMany).mockResolvedValue([]);

      const participantCreateMock = vi.fn().mockResolvedValue({ id: 'p1' });
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        const tx = {
          team: {
            create: vi.fn().mockResolvedValue({ id: 'new-t1', name: 'Alpha', eventId: 'e1' }),
            update: vi.fn(),
          },
          participant: {
            create: participantCreateMock,
            update: vi.fn(),
          },
        };
        return cb(tx);
      });

      const result = await ImportService.apply('e1', 'o1', {
        fileId: 'file-dedup',
        mapping: {
          teamName: 0,
          participantName: 1,
          participantEmail: null,
          projectDescription: null,
        },

      });

      // Only Alice and Bob should be created (alice duplicate skipped)
      expect(participantCreateMock).toHaveBeenCalledTimes(2);
      expect(result.teamsCreated).toBe(1);
    });

    it('should reject when optional column index is out of range', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);

      const cache = ImportService._getCache();
      cache.set('file-badcol', {
        headers: ['Team', 'Name'],
        rows: [['Alpha', 'Alice']],
        createdAt: Date.now(),
      });

      await expect(
        ImportService.apply('e1', 'o1', {
          fileId: 'file-badcol',
          mapping: {
            teamName: 0,
            participantName: 1,
            participantEmail: 5, // out of range — only 2 columns (0, 1)
            projectDescription: null,
          },
        }),
      ).rejects.toThrow('participantEmail');
    });

    it('should use teamResolutions to match renamed teams to existing ones', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);

      const cache = ImportService._getCache();
      cache.set('file-resolve', {
        headers: ['Team', 'Name'],
        rows: [
          ['New Alpha Name', 'Dave'], // renamed team, should resolve to existing t1
        ],
        createdAt: Date.now(),
      });

      vi.mocked(prisma.team.count).mockResolvedValue(1);
      vi.mocked(prisma.team.findMany).mockResolvedValue([
        {
          id: 't1',
          name: 'Alpha',
          eventId: 'e1',
          participants: [{ id: 'p1', name: 'Alice', email: null }],
        },
      ] as any);

      const participantCreateMock = vi.fn().mockResolvedValue({ id: 'p2' });
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        const tx = {
          team: {
            create: vi.fn(),
            update: vi.fn().mockResolvedValue({}),
          },
          participant: {
            create: participantCreateMock,
            update: vi.fn(),
          },
        };
        return cb(tx);
      });

      const result = await ImportService.apply('e1', 'o1', {
        fileId: 'file-resolve',
        mapping: {
          teamName: 0,
          participantName: 1,
          participantEmail: null,
          projectDescription: null,
        },
        teamResolutions: {
          'New Alpha Name': 't1', // server normalizes to lowercase
        },
      });

      // Should update existing team, not create new one
      expect(result.teamsCreated).toBe(0);
      expect(result.teamsUpdated).toBe(1);
      expect(participantCreateMock).toHaveBeenCalledTimes(1);
      expect(participantCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: 'Dave', teamId: 't1' }),
        }),
      );
    });

    it('should reject teamResolutions pointing to non-existent team ID', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);

      const cache = ImportService._getCache();
      cache.set('file-bad-resolve', {
        headers: ['Team', 'Name'],
        rows: [['Alpha', 'Alice']],
        createdAt: Date.now(),
      });

      vi.mocked(prisma.team.count).mockResolvedValue(0);
      vi.mocked(prisma.team.findMany).mockResolvedValue([]);

      await expect(
        ImportService.apply('e1', 'o1', {
          fileId: 'file-bad-resolve',
          mapping: {
            teamName: 0,
            participantName: 1,
            participantEmail: null,
            projectDescription: null,
          },
          teamResolutions: {
            'alpha': 'non-existent-id',
          },
        }),
      ).rejects.toThrow('non-existent team ID');
    });

    it('should reject teamResolutions with duplicate target team IDs', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);

      const cache = ImportService._getCache();
      cache.set('file-dup-target', {
        headers: ['Team', 'Name'],
        rows: [
          ['Team A', 'Alice'],
          ['Team B', 'Bob'],
        ],
        createdAt: Date.now(),
      });

      vi.mocked(prisma.team.count).mockResolvedValue(1);
      vi.mocked(prisma.team.findMany).mockResolvedValue([
        {
          id: 't1',
          name: 'Existing',
          eventId: 'e1',
          participants: [],
        },
      ] as any);

      await expect(
        ImportService.apply('e1', 'o1', {
          fileId: 'file-dup-target',
          mapping: {
            teamName: 0,
            participantName: 1,
            participantEmail: null,
            projectDescription: null,
          },
          teamResolutions: {
            'team a': 't1',
            'team b': 't1', // same target — should be rejected
          },
        }),
      ).rejects.toThrow('resolve to the same existing team');
    });

    it('should reject when manual resolution and auto-match collide on the same existing team', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);

      const cache = ImportService._getCache();
      cache.set('file-cross-collision', {
        headers: ['Team', 'Name'],
        rows: [
          ['Alpha', 'Alice'],   // auto-matches existing "Alpha" (t1)
          ['Gamma', 'Bob'],     // manually resolved to t1
        ],
        createdAt: Date.now(),
      });

      vi.mocked(prisma.team.count).mockResolvedValue(1);
      vi.mocked(prisma.team.findMany).mockResolvedValue([
        {
          id: 't1',
          name: 'Alpha',
          eventId: 'e1',
          participants: [],
        },
      ] as any);

      await expect(
        ImportService.apply('e1', 'o1', {
          fileId: 'file-cross-collision',
          mapping: {
            teamName: 0,
            participantName: 1,
            participantEmail: null,
            projectDescription: null,
          },
          teamResolutions: {
            'gamma': 't1', // collides with "alpha" auto-matching to t1
          },
        }),
      ).rejects.toThrow('resolve to the same existing team');
    });
  });

  describe('auto-detect mapping', () => {
    it('should detect Russian column headers', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      vi.mocked(prisma.team.findMany).mockResolvedValue([]);

      const csvContent = 'ФИО,Команда,Электронная почта\nAlice,Alpha,alice@test.com';
      const csvPath = path.join(tmpDir, 'russian.csv');
      fs.writeFileSync(csvPath, csvContent, 'utf-8');

      const result = await ImportService.preview('e1', 'o1', csvPath, 'russian.csv');

      expect(result.suggestedMapping.participantName).toBe(0); // ФИО
      expect(result.suggestedMapping.teamName).toBe(1); // Команда
      expect(result.suggestedMapping.participantEmail).toBe(2); // Электронная почта
    });

    it('should detect English column headers', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      vi.mocked(prisma.team.findMany).mockResolvedValue([]);

      const csvContent = 'Team Name,Full Name,Email\nAlpha,Alice,alice@test.com';
      const csvPath = path.join(tmpDir, 'english.csv');
      fs.writeFileSync(csvPath, csvContent, 'utf-8');

      const result = await ImportService.preview('e1', 'o1', csvPath, 'english.csv');

      expect(result.suggestedMapping.teamName).toBe(0); // Team Name
      expect(result.suggestedMapping.participantName).toBe(1); // Full Name
      expect(result.suggestedMapping.participantEmail).toBe(2); // Email
    });
  });
});
