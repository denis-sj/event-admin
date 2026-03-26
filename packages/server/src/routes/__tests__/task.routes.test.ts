import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { taskRoutes } from '../task.routes.js';
import { TaskService } from '../../services/task.service.js';
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

vi.mock('../../services/task.service.js', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    TaskService: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      assignTask: vi.fn(),
    },
  };
});

const EVENT_ID = 'a0000000-0000-4000-8000-000000000001';
const TASK_ID = 'a0000000-0000-4000-8000-000000000002';
const TEAM_ID = 'a0000000-0000-4000-8000-000000000003';

const app = express();
app.use(express.json());
app.use(`/events/:eventId/tasks`, taskRoutes);
app.use(errorHandler);

describe('Task Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /events/:eventId/tasks', () => {
    it('should return tasks list', async () => {
      vi.mocked(TaskService.list).mockResolvedValue([
        { id: 't1', title: 'Task 1', teams: [] },
      ] as any);

      const response = await request(app).get(`/events/${EVENT_ID}/tasks`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
    });
  });

  describe('POST /events/:eventId/tasks', () => {
    it('should create a task', async () => {
      vi.mocked(TaskService.create).mockResolvedValue({
        id: 't1',
        title: 'New Task',
        difficulty: 'MEDIUM',
      } as any);

      const response = await request(app)
        .post(`/events/${EVENT_ID}/tasks`)
        .send({ title: 'New Task', difficulty: 'MEDIUM' });

      expect(response.status).toBe(201);
      expect(response.body.data.title).toBe('New Task');
    });

    it('should fail without title', async () => {
      const response = await request(app)
        .post(`/events/${EVENT_ID}/tasks`)
        .send({ difficulty: 'HIGH' });

      expect(response.status).toBe(400);
    });

    it('should fail with invalid difficulty', async () => {
      const response = await request(app)
        .post(`/events/${EVENT_ID}/tasks`)
        .send({ title: 'Test', difficulty: 'INVALID' });

      expect(response.status).toBe(400);
    });
  });

  describe('PATCH /events/:eventId/tasks/:taskId', () => {
    it('should update a task', async () => {
      vi.mocked(TaskService.update).mockResolvedValue({
        id: TASK_ID,
        title: 'Updated',
      } as any);

      const response = await request(app)
        .patch(`/events/${EVENT_ID}/tasks/${TASK_ID}`)
        .send({ title: 'Updated' });

      expect(response.status).toBe(200);
      expect(response.body.data.title).toBe('Updated');
    });
  });

  describe('DELETE /events/:eventId/tasks/:taskId', () => {
    it('should delete a task', async () => {
      vi.mocked(TaskService.delete).mockResolvedValue(undefined);

      const response = await request(app).delete(
        `/events/${EVENT_ID}/tasks/${TASK_ID}`,
      );

      expect(response.status).toBe(204);
    });
  });

  describe('POST /events/:eventId/tasks/assign', () => {
    it('should assign a task to a team', async () => {
      vi.mocked(TaskService.assignTask).mockResolvedValue({
        id: TEAM_ID,
        taskId: TASK_ID,
        task: { id: TASK_ID, title: 'Task 1' },
      } as any);

      const response = await request(app)
        .post(`/events/${EVENT_ID}/tasks/assign`)
        .send({ teamId: TEAM_ID, taskId: TASK_ID });

      expect(response.status).toBe(200);
      expect(response.body.data.taskId).toBe(TASK_ID);
    });

    it('should unassign a task (null taskId)', async () => {
      vi.mocked(TaskService.assignTask).mockResolvedValue({
        id: TEAM_ID,
        taskId: null,
        task: null,
      } as any);

      const response = await request(app)
        .post(`/events/${EVENT_ID}/tasks/assign`)
        .send({ teamId: TEAM_ID, taskId: null });

      expect(response.status).toBe(200);
      expect(response.body.data.taskId).toBeNull();
    });

    it('should fail without teamId', async () => {
      const response = await request(app)
        .post(`/events/${EVENT_ID}/tasks/assign`)
        .send({ taskId: TASK_ID });

      expect(response.status).toBe(400);
    });
  });
});
