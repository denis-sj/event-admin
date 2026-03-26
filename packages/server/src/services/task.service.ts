import { z } from 'zod';
import { prisma } from '../prisma.js';
import { ApiError } from '../utils/errors.js';
import {
  createTaskSchema,
  updateTaskSchema,
  assignTaskSchema,
  ERROR_CODES,
  MAX_TASKS,
} from '@ideathon/shared';

export const createTaskValidation = z.object({
  body: createTaskSchema,
  params: z.object({ eventId: z.string().uuid() }),
});

export const updateTaskValidation = z.object({
  body: updateTaskSchema,
  params: z.object({
    eventId: z.string().uuid(),
    taskId: z.string().uuid(),
  }),
});

export const deleteTaskValidation = z.object({
  params: z.object({
    eventId: z.string().uuid(),
    taskId: z.string().uuid(),
  }),
});

export const assignTaskValidation = z.object({
  body: assignTaskSchema,
  params: z.object({ eventId: z.string().uuid() }),
});

export const taskEventParamValidation = z.object({
  params: z.object({ eventId: z.string().uuid() }),
});

async function ensureEventOwnership(eventId: string, organizerId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { organizerId: true, uniqueTaskAssignment: true },
  });

  if (!event) {
    throw ApiError.notFound('Event not found');
  }

  if (event.organizerId !== organizerId) {
    throw ApiError.forbidden('Access denied');
  }

  return event;
}

export class TaskService {
  static async list(eventId: string, organizerId: string) {
    await ensureEventOwnership(eventId, organizerId);

    return prisma.task.findMany({
      where: { eventId },
      include: {
        teams: {
          select: { id: true, name: true },
        },
      },
    });
  }

  static async create(
    eventId: string,
    organizerId: string,
    data: z.infer<typeof createTaskSchema>,
  ) {
    await ensureEventOwnership(eventId, organizerId);

    const count = await prisma.task.count({ where: { eventId } });
    if (count >= MAX_TASKS) {
      throw ApiError.badRequest(`Maximum ${MAX_TASKS} tasks allowed per event`);
    }

    return prisma.task.create({
      data: {
        eventId,
        title: data.title,
        description: data.description,
        difficulty: data.difficulty,
      },
    });
  }

  static async update(
    eventId: string,
    taskId: string,
    organizerId: string,
    data: z.infer<typeof updateTaskSchema>,
  ) {
    await ensureEventOwnership(eventId, organizerId);

    const task = await prisma.task.findFirst({
      where: { id: taskId, eventId },
    });

    if (!task) {
      throw ApiError.notFound('Task not found');
    }

    return prisma.task.update({
      where: { id: taskId },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.difficulty !== undefined && { difficulty: data.difficulty }),
      },
    });
  }

  static async delete(eventId: string, taskId: string, organizerId: string) {
    await ensureEventOwnership(eventId, organizerId);

    const task = await prisma.task.findFirst({
      where: { id: taskId, eventId },
    });

    if (!task) {
      throw ApiError.notFound('Task not found');
    }

    // Unassign the task from any teams before deleting
    await prisma.team.updateMany({
      where: { taskId },
      data: { taskId: null },
    });

    await prisma.task.delete({ where: { id: taskId } });
  }

  static async assignTask(
    eventId: string,
    organizerId: string,
    data: z.infer<typeof assignTaskSchema>,
  ) {
    const event = await ensureEventOwnership(eventId, organizerId);

    // Verify team belongs to the event
    const team = await prisma.team.findFirst({
      where: { id: data.teamId, eventId },
    });

    if (!team) {
      throw ApiError.notFound('Team not found in this event');
    }

    // If unassigning, no need for transaction
    if (data.taskId === null) {
      return prisma.team.update({
        where: { id: data.teamId },
        data: { taskId: null },
        include: { task: true },
      });
    }

    // Verify task belongs to the event
    const task = await prisma.task.findFirst({
      where: { id: data.taskId, eventId },
    });

    if (!task) {
      throw ApiError.notFound('Task not found in this event');
    }

    // Use transaction for atomic check-and-assign when uniqueTaskAssignment is enabled
    if (event.uniqueTaskAssignment) {
      return prisma.$transaction(async (tx) => {
        const existingAssignment = await tx.team.findFirst({
          where: {
            eventId,
            taskId: data.taskId,
            id: { not: data.teamId },
          },
        });

        if (existingAssignment) {
          throw ApiError.conflict(
            `Task is already assigned to team "${existingAssignment.name}"`,
            ERROR_CODES.TASK_ALREADY_ASSIGNED,
          );
        }

        return tx.team.update({
          where: { id: data.teamId },
          data: { taskId: data.taskId },
          include: { task: true },
        });
      });
    }

    return prisma.team.update({
      where: { id: data.teamId },
      data: { taskId: data.taskId },
      include: { task: true },
    });
  }
}
