import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { resultsRoutes } from '../results.routes.js';
import { ResultsService } from '../../services/results.service.js';
import { errorHandler } from '../../middleware/error-handler.js';

vi.mock('../../config.js', () => ({
  config: { JWT_SECRET: 'test_secret', UPLOAD_DIR: './uploads', NODE_ENV: 'test' },
}));

vi.mock('../../middleware/auth.js', () => ({
  authOrganizer: (req: any, _res: any, next: any) => {
    req.organizer = { organizerId: 'o1' };
    next();
  },
}));

vi.mock('../../services/results.service.js', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    ResultsService: {
      getResults: vi.fn(),
      exportResults: vi.fn(),
    },
  };
});

const eventId = 'a0000000-0000-4000-8000-000000000001';

const app = express();
app.use(express.json());
app.use(`/events/:eventId/results`, resultsRoutes);
app.use(errorHandler);

const sampleResults = {
  filter: { taskId: null },
  teams: [
    {
      id: 't1',
      name: 'Alpha',
      taskId: null,
      taskTitle: null,
      rank: 1,
      totalAvgScore: 8.5,
      criteriaScores: [
        {
          criterionId: 'c1',
          criterionName: 'Innovation',
          avgScore: 8.5,
          juryScores: [
            { juryMemberId: 'j1', juryName: 'Judge 1', value: 9, isAnomaly: false, comment: 'Great work' },
            { juryMemberId: 'j2', juryName: 'Judge 2', value: 8, isAnomaly: false, comment: null },
          ],
        },
      ],
    },
  ],
  anomalyThreshold: 2,
};

describe('Results Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /events/:eventId/results', () => {
    it('should return results with correct JSON shape', async () => {
      vi.mocked(ResultsService.getResults).mockResolvedValue(sampleResults as any);

      const response = await request(app).get(`/events/${eventId}/results`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      const data = response.body.data;
      expect(data).toHaveProperty('filter');
      expect(data).toHaveProperty('teams');
      expect(data).toHaveProperty('anomalyThreshold');
      expect(data.filter.taskId).toBeNull();
      expect(data.anomalyThreshold).toBe(2);
      expect(data.teams).toHaveLength(1);
      expect(data.teams[0]).toHaveProperty('id');
      expect(data.teams[0]).toHaveProperty('rank');
      expect(data.teams[0]).toHaveProperty('totalAvgScore');
      expect(data.teams[0]).toHaveProperty('criteriaScores');
      expect(data.teams[0].criteriaScores[0]).toHaveProperty('juryScores');
      expect(data.teams[0].criteriaScores[0].juryScores[0]).toHaveProperty('comment');
    });

    it('should pass taskId query param to service', async () => {
      const taskId = 'b0000000-0000-4000-8000-000000000002';
      vi.mocked(ResultsService.getResults).mockResolvedValue({
        ...sampleResults,
        filter: { taskId },
      } as any);

      const response = await request(app)
        .get(`/events/${eventId}/results`)
        .query({ taskId });

      expect(response.status).toBe(200);
      expect(ResultsService.getResults).toHaveBeenCalledWith(eventId, 'o1', taskId);
      expect(response.body.data.filter.taskId).toBe(taskId);
    });

    it('should fail validation with invalid eventId', async () => {
      const response = await request(app).get('/events/not-a-uuid/results');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should fail validation with invalid taskId query param', async () => {
      const response = await request(app)
        .get(`/events/${eventId}/results`)
        .query({ taskId: 'not-a-uuid' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /events/:eventId/results/export', () => {
    it('should return xlsx with correct headers', async () => {
      const xlsxBuffer = Buffer.from('fake-xlsx-content');
      vi.mocked(ResultsService.exportResults).mockResolvedValue({
        buffer: xlsxBuffer,
        filename: `results-${eventId}.xlsx`,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const response = await request(app).get(`/events/${eventId}/results/export`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toContain('.xlsx');
      expect(ResultsService.exportResults).toHaveBeenCalledWith(eventId, 'o1', 'xlsx', undefined);
    });

    it('should support csv format via query param', async () => {
      const csvBuffer = Buffer.from('Rank,Team\n1,Alpha');
      vi.mocked(ResultsService.exportResults).mockResolvedValue({
        buffer: csvBuffer,
        filename: `results-${eventId}.csv`,
        contentType: 'text/csv; charset=utf-8',
      });

      const response = await request(app)
        .get(`/events/${eventId}/results/export`)
        .query({ format: 'csv' });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('.csv');
      expect(ResultsService.exportResults).toHaveBeenCalledWith(eventId, 'o1', 'csv', undefined);
    });

    it('should fail validation with invalid format', async () => {
      const response = await request(app)
        .get(`/events/${eventId}/results/export`)
        .query({ format: 'pdf' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });
});
