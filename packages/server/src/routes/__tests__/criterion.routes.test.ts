import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { criterionRoutes } from '../criterion.routes.js';
import { CriterionService } from '../../services/criterion.service.js';
import { errorHandler } from '../../middleware/error-handler.js';

vi.mock('../../config.js', () => ({
  config: { JWT_SECRET: 'test_secret' },
}));

vi.mock('../../middleware/auth.js', () => ({
  authOrganizer: (req: any, _res: any, next: any) => {
    req.organizer = { organizerId: 'o1' };
    next();
  },
}));

vi.mock('../../services/criterion.service.js', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    CriterionService: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      reorder: vi.fn(),
    },
  };
});

const EVENT_ID = 'a0000000-0000-4000-8000-000000000001';
const CRITERION_ID = 'a0000000-0000-4000-8000-000000000002';

const app = express();
app.use(express.json());
app.use(`/events/:eventId/criteria`, criterionRoutes);
app.use(errorHandler);

describe('Criterion Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /events/:eventId/criteria', () => {
    it('should return criteria list', async () => {
      vi.mocked(CriterionService.list).mockResolvedValue([
        { id: 'c1', name: 'Innovation', maxScore: 10, sortOrder: 0 },
      ] as any);

      const response = await request(app).get(`/events/${EVENT_ID}/criteria`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
    });
  });

  describe('POST /events/:eventId/criteria', () => {
    it('should create a criterion', async () => {
      vi.mocked(CriterionService.create).mockResolvedValue({
        id: 'c1',
        name: 'Innovation',
        maxScore: 10,
      } as any);

      const response = await request(app)
        .post(`/events/${EVENT_ID}/criteria`)
        .send({ name: 'Innovation', maxScore: 10 });

      expect(response.status).toBe(201);
      expect(response.body.data.name).toBe('Innovation');
    });

    it('should fail without required fields', async () => {
      const response = await request(app)
        .post(`/events/${EVENT_ID}/criteria`)
        .send({});

      expect(response.status).toBe(400);
    });

    it('should fail with maxScore out of range', async () => {
      const response = await request(app)
        .post(`/events/${EVENT_ID}/criteria`)
        .send({ name: 'Test', maxScore: 0 });

      expect(response.status).toBe(400);
    });
  });

  describe('PATCH /events/:eventId/criteria/:criterionId', () => {
    it('should update a criterion', async () => {
      vi.mocked(CriterionService.update).mockResolvedValue({
        id: CRITERION_ID,
        name: 'Updated',
        maxScore: 20,
      } as any);

      const response = await request(app)
        .patch(`/events/${EVENT_ID}/criteria/${CRITERION_ID}`)
        .send({ name: 'Updated', maxScore: 20 });

      expect(response.status).toBe(200);
      expect(response.body.data.name).toBe('Updated');
    });
  });

  describe('DELETE /events/:eventId/criteria/:criterionId', () => {
    it('should delete a criterion', async () => {
      vi.mocked(CriterionService.delete).mockResolvedValue(undefined);

      const response = await request(app).delete(
        `/events/${EVENT_ID}/criteria/${CRITERION_ID}`,
      );

      expect(response.status).toBe(204);
    });
  });

  describe('PUT /events/:eventId/criteria/order', () => {
    it('should reorder criteria', async () => {
      vi.mocked(CriterionService.reorder).mockResolvedValue([
        { id: 'c2', sortOrder: 0 },
        { id: 'c1', sortOrder: 1 },
      ] as any);

      const response = await request(app)
        .put(`/events/${EVENT_ID}/criteria/order`)
        .send({
          criterionIds: [
            'a0000000-0000-4000-8000-000000000010',
            'a0000000-0000-4000-8000-000000000011',
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
    });

    it('should fail with non-UUID IDs', async () => {
      const response = await request(app)
        .put(`/events/${EVENT_ID}/criteria/order`)
        .send({ criterionIds: ['not-uuid'] });

      expect(response.status).toBe(400);
    });
  });
});
