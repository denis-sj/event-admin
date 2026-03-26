import { Router } from 'express';
import { authOrganizer } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  TaskService,
  createTaskValidation,
  updateTaskValidation,
  deleteTaskValidation,
  assignTaskValidation,
  taskEventParamValidation,
} from '../services/task.service.js';

export const taskRoutes = Router({ mergeParams: true });

// All routes require organizer authentication
taskRoutes.use(authOrganizer);

// GET /api/organizer/events/:eventId/tasks — list tasks
taskRoutes.get('/', validate(taskEventParamValidation), async (req, res, next) => {
  try {
    const tasks = await TaskService.list(req.params.eventId as string, req.organizer!.organizerId);
    res.json({ success: true, data: tasks });
  } catch (error) {
    next(error);
  }
});

// POST /api/organizer/events/:eventId/tasks — create task
taskRoutes.post('/', validate(createTaskValidation), async (req, res, next) => {
  try {
    const task = await TaskService.create(
      req.params.eventId as string,
      req.organizer!.organizerId,
      req.body,
    );
    res.status(201).json({ success: true, data: task });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/organizer/events/:eventId/tasks/:taskId — update task
taskRoutes.patch('/:taskId', validate(updateTaskValidation), async (req, res, next) => {
  try {
    const task = await TaskService.update(
      req.params.eventId as string,
      req.params.taskId as string,
      req.organizer!.organizerId,
      req.body,
    );
    res.json({ success: true, data: task });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/organizer/events/:eventId/tasks/:taskId — delete task
taskRoutes.delete('/:taskId', validate(deleteTaskValidation), async (req, res, next) => {
  try {
    await TaskService.delete(
      req.params.eventId as string,
      req.params.taskId as string,
      req.organizer!.organizerId,
    );
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// POST /api/organizer/events/:eventId/tasks/assign — assign task to team
taskRoutes.post('/assign', validate(assignTaskValidation), async (req, res, next) => {
  try {
    const team = await TaskService.assignTask(
      req.params.eventId as string,
      req.organizer!.organizerId,
      req.body,
    );
    res.json({ success: true, data: team });
  } catch (error) {
    next(error);
  }
});
