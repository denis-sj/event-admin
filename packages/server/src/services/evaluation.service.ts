import { z } from 'zod';
import { prisma } from '../prisma.js';
import { ApiError } from '../utils/errors.js';
import { Broadcaster } from '../ws/broadcaster.js';
import {
  saveScoresSchema,
  WS_EVENTS,
  ERROR_CODES,
} from '@ideathon/shared';

export const evaluationEventParamValidation = z.object({
  params: z.object({ eventId: z.string().uuid() }),
});

export const evaluationTeamParamValidation = z.object({
  params: z.object({
    eventId: z.string().uuid(),
    teamId: z.string().uuid(),
  }),
});

export const saveScoresValidation = z.object({
  body: saveScoresSchema,
  params: z.object({
    eventId: z.string().uuid(),
    teamId: z.string().uuid(),
  }),
});

export const confirmEvaluationValidation = z.object({
  params: z.object({
    eventId: z.string().uuid(),
    teamId: z.string().uuid(),
  }),
});

export class EvaluationService {
  // Get event data for jury (public info visible to jury)
  static async getEventForJury(eventId: string) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        title: true,
        description: true,
        date: true,
        logoPath: true,
        status: true,
        currentTeamId: true,
        scoringTeamId: true,
        timerDuration: true,
        criteria: {
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            name: true,
            description: true,
            maxScore: true,
            sortOrder: true,
          },
        },
      },
    });

    if (!event) {
      throw ApiError.notFound('Event not found');
    }

    return event;
  }

  // Get teams for jury with evaluation status
  static async getTeamsForJury(eventId: string, juryMemberId: string) {
    const teams = await prisma.team.findMany({
      where: { eventId },
      orderBy: { presentationOrder: { sort: 'asc', nulls: 'last' } },
      include: {
        participants: {
          select: { id: true, name: true },
        },
        task: {
          select: { id: true, title: true },
        },
        evaluations: {
          where: { juryMemberId },
          select: {
            id: true,
            status: true,
            comment: true,
            scores: {
              select: {
                criterionId: true,
                value: true,
              },
            },
          },
        },
      },
    });

    return teams.map((team) => {
      const evaluation = team.evaluations[0] || null;
      return {
        id: team.id,
        name: team.name,
        projectDescription: team.projectDescription,
        presentationOrder: team.presentationOrder,
        participants: team.participants,
        task: team.task,
        evaluation: evaluation
          ? {
              id: evaluation.id,
              status: evaluation.status,
              comment: evaluation.comment,
              scores: evaluation.scores,
            }
          : null,
      };
    });
  }

  // Get single team data for jury with evaluation
  static async getTeamForJury(eventId: string, teamId: string, juryMemberId: string) {
    const team = await prisma.team.findFirst({
      where: { id: teamId, eventId },
      include: {
        participants: {
          select: { id: true, name: true },
        },
        task: {
          select: { id: true, title: true, description: true },
        },
        evaluations: {
          where: { juryMemberId },
          include: {
            scores: {
              select: {
                id: true,
                criterionId: true,
                value: true,
              },
            },
          },
        },
      },
    });

    if (!team) {
      throw ApiError.notFound('Team not found');
    }

    const evaluation = team.evaluations[0] || null;
    return {
      id: team.id,
      name: team.name,
      projectDescription: team.projectDescription,
      presentationOrder: team.presentationOrder,
      participants: team.participants,
      task: team.task,
      evaluation: evaluation
        ? {
            id: evaluation.id,
            status: evaluation.status,
            comment: evaluation.comment,
            scores: evaluation.scores,
          }
        : null,
    };
  }

  // Save scores (draft) — create or update evaluation
  static async saveScores(
    eventId: string,
    teamId: string,
    juryMemberId: string,
    data: z.infer<typeof saveScoresSchema>,
  ) {
    // Verify event is active and scoring is open for this team
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { status: true, scoringTeamId: true, organizerId: true },
    });

    if (!event) {
      throw ApiError.notFound('Event not found');
    }

    if (event.status !== 'ACTIVE') {
      throw ApiError.conflict('Event is not active', ERROR_CODES.EVENT_NOT_ACTIVE);
    }

    if (event.scoringTeamId !== teamId) {
      throw ApiError.conflict(
        'Scoring is not open for this team',
        ERROR_CODES.SCORING_CLOSED,
      );
    }

    // Verify team belongs to event
    const team = await prisma.team.findFirst({
      where: { id: teamId, eventId },
    });
    if (!team) {
      throw ApiError.notFound('Team not found in this event');
    }

    // Verify criteria belong to this event and scores are within limits
    const criteria = await prisma.criterion.findMany({
      where: { eventId },
      select: { id: true, maxScore: true },
    });

    const criteriaMap = new Map(criteria.map((c) => [c.id, c.maxScore]));

    for (const score of data.scores) {
      const maxScore = criteriaMap.get(score.criterionId);
      if (maxScore === undefined) {
        throw ApiError.badRequest(`Criterion ${score.criterionId} not found in this event`);
      }
      if (score.value > maxScore) {
        throw ApiError.badRequest(
          `Score ${score.value} exceeds maximum ${maxScore} for criterion ${score.criterionId}`,
        );
      }
    }

    // Upsert evaluation with scores in a transaction (full replacement).
    // If evaluation was previously CONFIRMED, saving new scores moves it back to DRAFT.
    // Scores not present in the request are deleted so the UI can clear individual criteria.
    const evaluation = await prisma.$transaction(async (tx) => {
      const eval_ = await tx.teamEvaluation.upsert({
        where: {
          juryMemberId_teamId: { juryMemberId, teamId },
        },
        create: {
          juryMemberId,
          teamId,
          status: 'DRAFT',
          comment: data.comment,
        },
        update: {
          comment: data.comment,
          status: 'DRAFT',
        },
      });

      // Delete scores whose criterionId is not in the incoming payload
      const incomingCriterionIds = data.scores.map((s) => s.criterionId);
      await tx.score.deleteMany({
        where: {
          evaluationId: eval_.id,
          criterionId: { notIn: incomingCriterionIds },
        },
      });

      // Upsert remaining scores
      for (const score of data.scores) {
        await tx.score.upsert({
          where: {
            evaluationId_criterionId: {
              evaluationId: eval_.id,
              criterionId: score.criterionId,
            },
          },
          create: {
            evaluationId: eval_.id,
            criterionId: score.criterionId,
            value: score.value,
          },
          update: {
            value: score.value,
          },
        });
      }

      return tx.teamEvaluation.findUnique({
        where: { id: eval_.id },
        include: {
          scores: {
            select: { id: true, criterionId: true, value: true },
          },
        },
      });
    });

    // Broadcast to organizer
    Broadcaster.broadcastToOrganizer(eventId, event.organizerId, WS_EVENTS.SCORES_UPDATED, {
      juryMemberId,
      teamId,
      status: 'DRAFT',
    });

    return evaluation;
  }

  // Confirm evaluation (DRAFT → CONFIRMED)
  static async confirmEvaluation(
    eventId: string,
    teamId: string,
    juryMemberId: string,
  ) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { status: true, scoringTeamId: true, organizerId: true },
    });

    if (!event) {
      throw ApiError.notFound('Event not found');
    }

    if (event.status !== 'ACTIVE') {
      throw ApiError.conflict('Event is not active', ERROR_CODES.EVENT_NOT_ACTIVE);
    }

    if (event.scoringTeamId !== teamId) {
      throw ApiError.conflict(
        'Scoring is not open for this team',
        ERROR_CODES.SCORING_CLOSED,
      );
    }

    const evaluation = await prisma.teamEvaluation.findUnique({
      where: {
        juryMemberId_teamId: { juryMemberId, teamId },
      },
      include: {
        scores: true,
      },
    });

    if (!evaluation) {
      throw ApiError.notFound('Evaluation not found — save scores first');
    }

    // Verify all criteria are scored
    const criteria = await prisma.criterion.findMany({
      where: { eventId },
      select: { id: true },
    });

    const scoredCriterionIds = new Set(evaluation.scores.map((s) => s.criterionId));
    const missingCriteria = criteria.filter((c) => !scoredCriterionIds.has(c.id));

    if (missingCriteria.length > 0) {
      throw ApiError.badRequest(
        `Missing scores for ${missingCriteria.length} criteria`,
        { missingCriterionIds: missingCriteria.map((c) => c.id) },
      );
    }

    const confirmed = await prisma.teamEvaluation.update({
      where: { id: evaluation.id },
      data: { status: 'CONFIRMED' },
      include: {
        scores: {
          select: { id: true, criterionId: true, value: true },
        },
      },
    });

    // Broadcast to organizer
    Broadcaster.broadcastToOrganizer(eventId, event.organizerId, WS_EVENTS.SCORES_UPDATED, {
      juryMemberId,
      teamId,
      status: 'CONFIRMED',
    });

    return confirmed;
  }
}
