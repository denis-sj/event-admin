import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { Readable } from 'stream';
import { z } from 'zod';
import { errorHandler } from '../../middleware/error-handler.js';

vi.mock('../../config.js', () => ({
  config: { JWT_SECRET: 'test_secret', UPLOAD_DIR: './uploads', NODE_ENV: 'test', BASE_URL: 'http://localhost:4321' },
}));

vi.mock('../../middleware/auth.js', () => ({
  authOrganizer: (req: any, _res: any, next: any) => {
    req.organizer = { organizerId: 'o1' };
    next();
  },
}));

// Mock fs at the module level — the route file uses fs at import-time for mkdirSync
const mockExistsSync = vi.fn().mockReturnValue(true);
const mockMkdirSync = vi.fn();
const mockCreateReadStream = vi.fn();
vi.mock('fs', () => ({
  default: {
    existsSync: (...args: any[]) => mockExistsSync(...args),
    mkdirSync: (...args: any[]) => mockMkdirSync(...args),
    createReadStream: (...args: any[]) => mockCreateReadStream(...args),
    readdirSync: vi.fn().mockReturnValue([]),
  },
  existsSync: (...args: any[]) => mockExistsSync(...args),
  mkdirSync: (...args: any[]) => mockMkdirSync(...args),
  createReadStream: (...args: any[]) => mockCreateReadStream(...args),
  readdirSync: vi.fn().mockReturnValue([]),
}));

// Mock multer to avoid disk storage
vi.mock('multer', () => {
  const m = () => ({ single: () => (_req: any, _res: any, next: any) => next() });
  m.diskStorage = () => ({});
  m.MulterError = class MulterError extends Error {
    code: string;
    constructor(code: string) { super(code); this.code = code; }
  };
  return { default: m };
});

const mockGetDiplomaForTeam = vi.fn();
const mockGetSettings = vi.fn();
const mockUpdateSettings = vi.fn();
const mockUploadBackground = vi.fn();
const mockGeneratePreview = vi.fn();
const mockGenerateAll = vi.fn();
const mockDownloadAll = vi.fn();
const mockVerify = vi.fn();

// Build Zod validations inline (same shape as the real ones) to avoid await import
const diplomaSettingsParamValidation = z.object({
  params: z.object({ eventId: z.string().uuid() }),
});
const updateDiplomaSettingsValidation = z.object({
  params: z.object({ eventId: z.string().uuid() }),
  body: z.object({
    primaryColor: z.string().optional(),
    textColor: z.string().optional(),
  }),
});
const diplomaTeamParamValidation = z.object({
  params: z.object({
    eventId: z.string().uuid(),
    teamId: z.string().uuid(),
  }),
});

vi.mock('../../services/diploma.service.js', () => ({
  DiplomaService: {
    getDiplomaForTeam: (...args: any[]) => mockGetDiplomaForTeam(...args),
    getSettings: (...args: any[]) => mockGetSettings(...args),
    updateSettings: (...args: any[]) => mockUpdateSettings(...args),
    uploadBackground: (...args: any[]) => mockUploadBackground(...args),
    generatePreview: (...args: any[]) => mockGeneratePreview(...args),
    generateAll: (...args: any[]) => mockGenerateAll(...args),
    downloadAll: (...args: any[]) => mockDownloadAll(...args),
    verify: (...args: any[]) => mockVerify(...args),
  },
  diplomaSettingsParamValidation,
  updateDiplomaSettingsValidation,
  diplomaTeamParamValidation,
}));

const eventId = 'a0000000-0000-4000-8000-000000000001';
const teamId = 'b0000000-0000-4000-8000-000000000002';

let app: express.Express;

beforeEach(async () => {
  vi.clearAllMocks();
  mockExistsSync.mockReturnValue(true);

  const { diplomaRoutes } = await import('../diploma.routes.js');
  app = express();
  app.use(express.json());
  app.use('/events/:eventId/diplomas', diplomaRoutes);
  app.use(errorHandler);
});

describe('Diploma Routes', () => {
  describe('GET /events/:eventId/diplomas/:teamId', () => {
    it('should stream PDF with correct headers when file exists', async () => {
      mockGetDiplomaForTeam.mockResolvedValue({
        filePath: '/uploads/diplomas/event1/diploma-team1.pdf',
        team: { name: 'Команда Альфа', eventId },
      });

      mockExistsSync.mockReturnValue(true);

      const pdfContent = Buffer.from('%PDF-1.4 fake content');
      const readable = new Readable();
      readable.push(pdfContent);
      readable.push(null);
      mockCreateReadStream.mockReturnValue(readable);

      const response = await request(app)
        .get(`/events/${eventId}/diplomas/${teamId}`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toContain(`filename="diploma-${teamId}.pdf"`);
      // UTF-8 filename* should contain the encoded team name
      expect(response.headers['content-disposition']).toContain("filename*=UTF-8''");
      expect(response.headers['content-disposition']).toContain(encodeURIComponent('Команда Альфа'));
    });

    it('should return 404 when diploma has no filePath', async () => {
      mockGetDiplomaForTeam.mockResolvedValue({
        filePath: null,
        team: { name: 'Team A', eventId },
      });

      const response = await request(app)
        .get(`/events/${eventId}/diplomas/${teamId}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NOT_FOUND');
      expect(response.body.error.message).toContain('not generated yet');
    });

    it('should return 404 when file does not exist on disk', async () => {
      mockGetDiplomaForTeam.mockResolvedValue({
        filePath: '/uploads/diplomas/event1/diploma-team1.pdf',
        team: { name: 'Team A', eventId },
      });

      mockExistsSync.mockImplementation((p: string) => {
        if (typeof p === 'string' && p.includes('diploma-team1')) return false;
        return true;
      });

      const response = await request(app)
        .get(`/events/${eventId}/diplomas/${teamId}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('not found on disk');
    });

    it('should fail validation with invalid teamId', async () => {
      const response = await request(app)
        .get(`/events/${eventId}/diplomas/not-a-uuid`);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should fail validation with invalid eventId', async () => {
      const response = await request(app)
        .get(`/events/not-a-uuid/diplomas/${teamId}`);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /events/:eventId/diplomas/download-all', () => {
    it('should not be captured by /:teamId route', async () => {
      mockDownloadAll.mockRejectedValue(
        Object.assign(new Error('No diplomas generated yet'), { status: 404, code: 'NOT_FOUND' }),
      );

      const response = await request(app)
        .get(`/events/${eventId}/diplomas/download-all`);

      // Should hit the /download-all route (404 from service), not /:teamId (400 validation)
      expect(response.status).toBe(404);
      expect(mockDownloadAll).toHaveBeenCalled();
    });
  });
});
