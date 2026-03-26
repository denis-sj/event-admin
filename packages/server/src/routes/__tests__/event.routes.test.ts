import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { eventRoutes } from '../event.routes.js';
import { EventService } from '../../services/event.service.js';
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

vi.mock('../../services/event.service.js', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    EventService: {
      list: vi.fn(),
      getById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateStatus: vi.fn(),
      uploadLogo: vi.fn(),
    },
  };
});

const app = express();
app.use(express.json());
app.use('/events', eventRoutes);
app.use(errorHandler);

describe('Event Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /events', () => {
    it('should return list of events', async () => {
      vi.mocked(EventService.list).mockResolvedValue([
        { id: 'e1', title: 'Event 1' },
      ] as any);

      const response = await request(app).get('/events');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
    });
  });

  describe('GET /events/:eventId', () => {
    it('should return a specific event', async () => {
      vi.mocked(EventService.getById).mockResolvedValue({
        id: 'e1',
        title: 'Event 1',
      } as any);

      const response = await request(app).get(
        '/events/a0000000-0000-4000-8000-000000000001',
      );

      expect(response.status).toBe(200);
      expect(response.body.data.title).toBe('Event 1');
    });

    it('should fail validation with invalid UUID', async () => {
      const response = await request(app).get('/events/not-a-uuid');

      expect(response.status).toBe(400);
    });
  });

  describe('POST /events', () => {
    it('should create an event', async () => {
      vi.mocked(EventService.create).mockResolvedValue({
        id: 'e1',
        title: 'New Event',
      } as any);

      const response = await request(app)
        .post('/events')
        .send({
          title: 'New Event',
          description: 'Test',
          date: '2025-06-01T10:00:00.000Z',
          timerDuration: 300,
          uniqueTaskAssignment: false,
        });

      expect(response.status).toBe(201);
      expect(response.body.data.title).toBe('New Event');
    });

    it('should fail without required fields', async () => {
      const response = await request(app)
        .post('/events')
        .send({ description: 'Only description' });

      expect(response.status).toBe(400);
    });
  });

  describe('PATCH /events/:eventId', () => {
    it('should update an event', async () => {
      vi.mocked(EventService.update).mockResolvedValue({
        id: 'e1',
        title: 'Updated',
      } as any);

      const response = await request(app)
        .patch('/events/a0000000-0000-4000-8000-000000000001')
        .send({ title: 'Updated' });

      expect(response.status).toBe(200);
      expect(response.body.data.title).toBe('Updated');
    });
  });

  describe('PATCH /events/:eventId/status', () => {
    it('should update event status', async () => {
      vi.mocked(EventService.updateStatus).mockResolvedValue({
        id: 'e1',
        status: 'ACTIVE',
      } as any);

      const response = await request(app)
        .patch('/events/a0000000-0000-4000-8000-000000000001/status')
        .send({ status: 'ACTIVE' });

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('ACTIVE');
    });

    it('should fail with invalid status', async () => {
      const response = await request(app)
        .patch('/events/a0000000-0000-4000-8000-000000000001/status')
        .send({ status: 'INVALID' });

      expect(response.status).toBe(400);
    });
  });
});
