import { z } from 'zod';
import { prisma } from '../prisma.js';
import { ApiError } from '../utils/errors.js';
import {
  createTeamSchema,
  updateTeamSchema,
  createParticipantSchema,
  updateParticipantSchema,
  MAX_TEAMS,
  MAX_PARTICIPANTS_PER_TEAM,
  ERROR_CODES,
} from '@ideathon/shared';

// Validation objects for routes
export const teamEventParamValidation = z.object({
  params: z.object({ eventId: z.string().uuid() }),
});

export const createTeamValidation = z.object({
  body: createTeamSchema,
  params: z.object({ eventId: z.string().uuid() }),
});

export const updateTeamValidation = z.object({
  body: updateTeamSchema,
  params: z.object({
    eventId: z.string().uuid(),
    teamId: z.string().uuid(),
  }),
});

export const deleteTeamValidation = z.object({
  params: z.object({
    eventId: z.string().uuid(),
    teamId: z.string().uuid(),
  }),
  query: z.object({
    force: z.enum(['true']).optional(),
  }).optional(),
});

export const createParticipantValidation = z.object({
  body: createParticipantSchema,
  params: z.object({
    eventId: z.string().uuid(),
    teamId: z.string().uuid(),
  }),
});

export const updateParticipantValidation = z.object({
  body: updateParticipantSchema,
  params: z.object({
    eventId: z.string().uuid(),
    teamId: z.string().uuid(),
    participantId: z.string().uuid(),
  }),
});

export const deleteParticipantValidation = z.object({
  params: z.object({
    eventId: z.string().uuid(),
    teamId: z.string().uuid(),
    participantId: z.string().uuid(),
  }),
});

async function ensureEventOwnership(eventId: string, organizerId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { organizerId: true, status: true, uniqueTaskAssignment: true },
  });

  if (!event) {
    throw ApiError.notFound('Event not found');
  }

  if (event.organizerId !== organizerId) {
    throw ApiError.forbidden('Access denied');
  }

  return event;
}

async function ensureTeamBelongsToEvent(teamId: string, eventId: string) {
  const team = await prisma.team.findFirst({
    where: { id: teamId, eventId },
  });

  if (!team) {
    throw ApiError.notFound('Team not found in this event');
  }

  return team;
}

export class TeamService {
  static async list(eventId: string, organizerId: string) {
    await ensureEventOwnership(eventId, organizerId);

    return prisma.team.findMany({
      where: { eventId },
      include: {
        participants: true,
        task: { select: { id: true, title: true } },
        _count: { select: { evaluations: true } },
      },
      orderBy: { presentationOrder: { sort: 'asc', nulls: 'last' } },
    });
  }

  static async getById(eventId: string, teamId: string, organizerId: string) {
    await ensureEventOwnership(eventId, organizerId);

    const team = await prisma.team.findFirst({
      where: { id: teamId, eventId },
      include: {
        participants: true,
        task: true,
        evaluations: {
          include: {
            scores: true,
            juryMember: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!team) {
      throw ApiError.notFound('Team not found');
    }

    return team;
  }

  static async create(
    eventId: string,
    organizerId: string,
    data: z.infer<typeof createTeamSchema>,
  ) {
    await ensureEventOwnership(eventId, organizerId);

    const count = await prisma.team.count({ where: { eventId } });
    if (count >= MAX_TEAMS) {
      throw ApiError.badRequest(`Maximum ${MAX_TEAMS} teams allowed per event`);
    }

    // Check unique name within event (case-insensitive, SQLite compatible)
    const existingTeams = await prisma.team.findMany({
      where: { eventId },
      select: { name: true },
    });
    const nameExists = existingTeams.some(
      (t: { name: string }) => t.name.toLowerCase() === data.name.toLowerCase(),
    );

    if (nameExists) {
      throw ApiError.conflict(`Team "${data.name}" already exists in this event`);
    }

    return prisma.team.create({
      data: {
        eventId,
        name: data.name,
        projectDescription: data.projectDescription,
      },
      include: { participants: true },
    });
  }

  static async update(
    eventId: string,
    teamId: string,
    organizerId: string,
    data: z.infer<typeof updateTeamSchema>,
  ) {
    const event = await ensureEventOwnership(eventId, organizerId);
    await ensureTeamBelongsToEvent(teamId, eventId);

    // If name is being changed, check uniqueness (case-insensitive, SQLite compatible)
    if (data.name !== undefined) {
      const existingTeams = await prisma.team.findMany({
        where: { eventId, id: { not: teamId } },
        select: { name: true },
      });
      const nameExists = existingTeams.some(
        (t: { name: string }) => t.name.toLowerCase() === data.name!.toLowerCase(),
      );

      if (nameExists) {
        throw ApiError.conflict(`Team "${data.name}" already exists in this event`);
      }
    }

    // If taskId is being set, verify task belongs to event and check uniqueTaskAssignment
    if (data.taskId !== undefined && data.taskId !== null) {
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
              taskId: data.taskId!,
              id: { not: teamId },
            },
          });

          if (existingAssignment) {
            throw ApiError.conflict(
              `Task is already assigned to team "${existingAssignment.name}"`,
              ERROR_CODES.TASK_ALREADY_ASSIGNED,
            );
          }

          return tx.team.update({
            where: { id: teamId },
            data: {
              ...(data.name !== undefined && { name: data.name }),
              ...(data.projectDescription !== undefined && { projectDescription: data.projectDescription }),
              taskId: data.taskId,
            },
            include: { participants: true, task: true },
          });
        });
      }
    }

    return prisma.team.update({
      where: { id: teamId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.projectDescription !== undefined && { projectDescription: data.projectDescription }),
        ...(data.taskId !== undefined && { taskId: data.taskId }),
      },
      include: { participants: true, task: true },
    });
  }

  static async delete(eventId: string, teamId: string, organizerId: string, force = false) {
    await ensureEventOwnership(eventId, organizerId);
    await ensureTeamBelongsToEvent(teamId, eventId);

    if (!force) {
      // Check if team has evaluations — require explicit confirmation
      const evaluationCount = await prisma.teamEvaluation.count({
        where: { teamId },
      });

      if (evaluationCount > 0) {
        throw ApiError.conflict(
          'Team has existing evaluations. Use ?force=true to confirm deletion.',
        );
      }
    }

    // Cascade deletes participants, evaluations, and scores via Prisma schema (onDelete: Cascade)
    await prisma.team.delete({ where: { id: teamId } });
  }

  // --- Participant methods ---

  static async addParticipant(
    eventId: string,
    teamId: string,
    organizerId: string,
    data: z.infer<typeof createParticipantSchema>,
  ) {
    await ensureEventOwnership(eventId, organizerId);
    await ensureTeamBelongsToEvent(teamId, eventId);

    const count = await prisma.participant.count({ where: { teamId } });
    if (count >= MAX_PARTICIPANTS_PER_TEAM) {
      throw ApiError.badRequest(
        `Maximum ${MAX_PARTICIPANTS_PER_TEAM} participants allowed per team`,
      );
    }

    return prisma.participant.create({
      data: {
        teamId,
        name: data.name,
        email: data.email,
      },
    });
  }

  static async updateParticipant(
    eventId: string,
    teamId: string,
    participantId: string,
    organizerId: string,
    data: z.infer<typeof updateParticipantSchema>,
  ) {
    await ensureEventOwnership(eventId, organizerId);
    await ensureTeamBelongsToEvent(teamId, eventId);

    const participant = await prisma.participant.findFirst({
      where: { id: participantId, teamId },
    });

    if (!participant) {
      throw ApiError.notFound('Participant not found');
    }

    return prisma.participant.update({
      where: { id: participantId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.email !== undefined && { email: data.email }),
      },
    });
  }

  static async deleteParticipant(
    eventId: string,
    teamId: string,
    participantId: string,
    organizerId: string,
  ) {
    await ensureEventOwnership(eventId, organizerId);
    await ensureTeamBelongsToEvent(teamId, eventId);

    const participant = await prisma.participant.findFirst({
      where: { id: participantId, teamId },
    });

    if (!participant) {
      throw ApiError.notFound('Participant not found');
    }

    await prisma.participant.delete({ where: { id: participantId } });
  }
}
