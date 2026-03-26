import { z } from 'zod';
import { prisma } from '../prisma.js';
import { ApiError } from '../utils/errors.js';
import { Broadcaster } from '../ws/broadcaster.js';
import { PresentationService } from './presentation.service.js';
import {
  createEventSchema,
  updateEventSchema,
  updateEventStatusSchema,
  EVENT_STATUS_TRANSITIONS,
  ERROR_CODES,
  WS_EVENTS,
  type EventStatus,
} from '@ideathon/shared';

export const createEventValidation = z.object({
  body: createEventSchema,
});

export const updateEventValidation = z.object({
  body: updateEventSchema,
  params: z.object({ eventId: z.string().uuid() }),
});

export const updateEventStatusValidation = z.object({
  body: updateEventStatusSchema,
  params: z.object({ eventId: z.string().uuid() }),
});

export const eventIdParamValidation = z.object({
  params: z.object({ eventId: z.string().uuid() }),
});

export class EventService {
  static async list(organizerId: string) {
    return prisma.event.findMany({
      where: { organizerId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { teams: true, criteria: true, tasks: true, juryMembers: true },
        },
      },
    });
  }

  static async getById(eventId: string, organizerId: string) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        criteria: { orderBy: { sortOrder: 'asc' } },
        teams: {
          include: { participants: true, task: true },
          orderBy: { presentationOrder: { sort: 'asc', nulls: 'last' } },
        },
        tasks: true,
        juryMembers: {
          select: {
            id: true,
            name: true,
            email: true,
            firstLogin: true,
            lastActive: true,
          },
        },
        _count: {
          select: { teams: true, criteria: true, tasks: true, juryMembers: true },
        },
      },
    });

    if (!event) {
      throw ApiError.notFound('Event not found');
    }

    if (event.organizerId !== organizerId) {
      throw ApiError.forbidden('Access denied');
    }

    return event;
  }

  static async create(
    organizerId: string,
    data: z.infer<typeof createEventSchema>,
  ) {
    return prisma.event.create({
      data: {
        organizerId,
        title: data.title,
        description: data.description,
        date: new Date(data.date),
        timerDuration: data.timerDuration,
        uniqueTaskAssignment: data.uniqueTaskAssignment,
      },
    });
  }

  static async update(
    eventId: string,
    organizerId: string,
    data: z.infer<typeof updateEventSchema>,
  ) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { organizerId: true },
    });

    if (!event) {
      throw ApiError.notFound('Event not found');
    }

    if (event.organizerId !== organizerId) {
      throw ApiError.forbidden('Access denied');
    }

    return prisma.event.update({
      where: { id: eventId },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.date !== undefined && { date: new Date(data.date) }),
        ...(data.timerDuration !== undefined && { timerDuration: data.timerDuration }),
        ...(data.uniqueTaskAssignment !== undefined && { uniqueTaskAssignment: data.uniqueTaskAssignment }),
      },
    });
  }

  static async updateStatus(
    eventId: string,
    organizerId: string,
    newStatus: EventStatus,
  ) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { organizerId: true, status: true },
    });

    if (!event) {
      throw ApiError.notFound('Event not found');
    }

    if (event.organizerId !== organizerId) {
      throw ApiError.forbidden('Access denied');
    }

    const currentStatus = event.status as EventStatus;
    const allowedTransitions = EVENT_STATUS_TRANSITIONS[currentStatus];

    if (!allowedTransitions.includes(newStatus)) {
      throw ApiError.conflict(
        `Cannot transition from ${currentStatus} to ${newStatus}`,
        ERROR_CODES.INVALID_STATUS_TRANSITION,
      );
    }

    // When closing scoring or completing, clear presentation runtime state
    const updateData: { status: EventStatus; scoringTeamId?: null; currentTeamId?: null } = {
      status: newStatus,
    };

    if (newStatus === 'SCORING_CLOSED' || newStatus === 'COMPLETED') {
      updateData.scoringTeamId = null;
    }

    if (newStatus === 'COMPLETED') {
      updateData.currentTeamId = null;
    }

    // Persist first — side-effects only run after the DB write succeeds
    const updated = await prisma.event.update({
      where: { id: eventId },
      data: updateData,
    });

    // Runtime cleanup & broadcasts (safe to fail — DB is already consistent)
    if (newStatus === 'SCORING_CLOSED' || newStatus === 'COMPLETED') {
      PresentationService.cleanupTimer(eventId);

      Broadcaster.broadcastToEvent(eventId, WS_EVENTS.SCORING_STATUS, {
        scoringTeamId: null,
        isOpen: false,
      });
    }

    if (newStatus === 'COMPLETED') {
      Broadcaster.broadcastToEvent(eventId, WS_EVENTS.TEAM_CURRENT, {
        team: null,
      });
    }

    return updated;
  }

  static async uploadLogo(
    eventId: string,
    organizerId: string,
    filePath: string,
  ) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { organizerId: true },
    });

    if (!event) {
      throw ApiError.notFound('Event not found');
    }

    if (event.organizerId !== organizerId) {
      throw ApiError.forbidden('Access denied');
    }

    return prisma.event.update({
      where: { id: eventId },
      data: { logoPath: filePath },
    });
  }
}
