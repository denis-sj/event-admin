import { z } from 'zod';
import { prisma } from '../prisma.js';
import { ApiError } from '../utils/errors.js';
import {
  createCriterionSchema,
  updateCriterionSchema,
  reorderCriteriaSchema,
  ERROR_CODES,
  MAX_CRITERIA,
} from '@ideathon/shared';

export const createCriterionValidation = z.object({
  body: createCriterionSchema,
  params: z.object({ eventId: z.string().uuid() }),
});

export const updateCriterionValidation = z.object({
  body: updateCriterionSchema,
  params: z.object({
    eventId: z.string().uuid(),
    criterionId: z.string().uuid(),
  }),
});

export const deleteCriterionValidation = z.object({
  params: z.object({
    eventId: z.string().uuid(),
    criterionId: z.string().uuid(),
  }),
});

export const reorderCriteriaValidation = z.object({
  body: reorderCriteriaSchema,
  params: z.object({ eventId: z.string().uuid() }),
});

export const criteriaEventParamValidation = z.object({
  params: z.object({ eventId: z.string().uuid() }),
});

async function ensureEventOwnership(eventId: string, organizerId: string) {
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

  return event;
}

export class CriterionService {
  static async list(eventId: string, organizerId: string) {
    await ensureEventOwnership(eventId, organizerId);

    return prisma.criterion.findMany({
      where: { eventId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  static async create(
    eventId: string,
    organizerId: string,
    data: z.infer<typeof createCriterionSchema>,
  ) {
    const event = await ensureEventOwnership(eventId, organizerId);

    if (event.status !== 'DRAFT') {
      throw ApiError.conflict(
        'Cannot modify criteria after event has been activated',
        ERROR_CODES.CRITERIA_LOCKED,
      );
    }

    const count = await prisma.criterion.count({ where: { eventId } });
    if (count >= MAX_CRITERIA) {
      throw ApiError.badRequest(`Maximum ${MAX_CRITERIA} criteria allowed per event`);
    }

    const maxOrder = await prisma.criterion.aggregate({
      where: { eventId },
      _max: { sortOrder: true },
    });

    return prisma.criterion.create({
      data: {
        eventId,
        name: data.name,
        description: data.description,
        maxScore: data.maxScore,
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      },
    });
  }

  static async update(
    eventId: string,
    criterionId: string,
    organizerId: string,
    data: z.infer<typeof updateCriterionSchema>,
  ) {
    const event = await ensureEventOwnership(eventId, organizerId);

    if (event.status !== 'DRAFT') {
      throw ApiError.conflict(
        'Cannot modify criteria after event has been activated',
        ERROR_CODES.CRITERIA_LOCKED,
      );
    }

    const criterion = await prisma.criterion.findFirst({
      where: { id: criterionId, eventId },
    });

    if (!criterion) {
      throw ApiError.notFound('Criterion not found');
    }

    return prisma.criterion.update({
      where: { id: criterionId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.maxScore !== undefined && { maxScore: data.maxScore }),
      },
    });
  }

  static async delete(
    eventId: string,
    criterionId: string,
    organizerId: string,
  ) {
    const event = await ensureEventOwnership(eventId, organizerId);

    if (event.status !== 'DRAFT') {
      throw ApiError.conflict(
        'Cannot modify criteria after event has been activated',
        ERROR_CODES.CRITERIA_LOCKED,
      );
    }

    const criterion = await prisma.criterion.findFirst({
      where: { id: criterionId, eventId },
    });

    if (!criterion) {
      throw ApiError.notFound('Criterion not found');
    }

    await prisma.criterion.delete({ where: { id: criterionId } });
  }

  static async reorder(
    eventId: string,
    organizerId: string,
    criterionIds: string[],
  ) {
    const event = await ensureEventOwnership(eventId, organizerId);

    if (event.status !== 'DRAFT') {
      throw ApiError.conflict(
        'Cannot modify criteria after event has been activated',
        ERROR_CODES.CRITERIA_LOCKED,
      );
    }

    const criteria = await prisma.criterion.findMany({
      where: { eventId },
      select: { id: true },
    });

    const existingIds = new Set(criteria.map((c) => c.id));
    const providedIds = new Set(criterionIds);

    if (existingIds.size !== providedIds.size || ![...existingIds].every((id) => providedIds.has(id))) {
      throw ApiError.badRequest('Provided criterion IDs do not match the existing criteria');
    }

    await prisma.$transaction(
      criterionIds.map((id, index) =>
        prisma.criterion.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );

    return prisma.criterion.findMany({
      where: { eventId },
      orderBy: { sortOrder: 'asc' },
    });
  }
}
