import crypto from 'crypto';
import { z } from 'zod';
import QRCode from 'qrcode';
import { prisma } from '../prisma.js';
import { ApiError } from '../utils/errors.js';
import { config } from '../config.js';
import {
  createJuryMemberSchema,
  updateJuryMemberSchema,
  JURY_TOKEN_BYTES,
  MAX_JURY,
} from '@ideathon/shared';
import { wss, type WSClient } from '../ws/server.js';
import { WebSocket } from 'ws';

export const juryEventParamValidation = z.object({
  params: z.object({ eventId: z.string().uuid() }),
});

export const createJuryValidation = z.object({
  body: createJuryMemberSchema,
  params: z.object({ eventId: z.string().uuid() }),
});

export const updateJuryValidation = z.object({
  body: updateJuryMemberSchema,
  params: z.object({
    eventId: z.string().uuid(),
    juryId: z.string().uuid(),
  }),
});

export const juryIdParamValidation = z.object({
  params: z.object({
    eventId: z.string().uuid(),
    juryId: z.string().uuid(),
  }),
});

function generateToken(): string {
  return crypto.randomBytes(JURY_TOKEN_BYTES).toString('hex');
}

async function ensureEventOwnership(eventId: string, organizerId: string) {
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

  return event;
}

function getOnlineJuryIds(eventId: string): Set<string> {
  const onlineIds = new Set<string>();
  wss.clients.forEach((client) => {
    const ws = client as WSClient;
    if (
      ws.readyState === WebSocket.OPEN &&
      ws.eventId === eventId &&
      ws.role === 'JURY' &&
      ws.juryMemberId
    ) {
      onlineIds.add(ws.juryMemberId);
    }
  });
  return onlineIds;
}

export class JuryService {
  static async list(eventId: string, organizerId: string) {
    await ensureEventOwnership(eventId, organizerId);

    const juryMembers = await prisma.juryMember.findMany({
      where: { eventId },
      select: {
        id: true,
        name: true,
        email: true,
        firstLogin: true,
        lastActive: true,
        eventId: true,
        evaluations: {
          select: { status: true },
        },
      },
    });

    const onlineIds = getOnlineJuryIds(eventId);
    const teamCount = await prisma.team.count({ where: { eventId } });

    return juryMembers.map((j) => {
      const confirmedCount = j.evaluations.filter((e) => e.status === 'CONFIRMED').length;
      const draftCount = j.evaluations.filter((e) => e.status === 'DRAFT').length;
      return {
        id: j.id,
        eventId: j.eventId,
        name: j.name,
        email: j.email,
        firstLogin: j.firstLogin,
        lastActive: j.lastActive,
        isOnline: onlineIds.has(j.id),
        confirmedEvaluations: confirmedCount,
        draftEvaluations: draftCount,
        totalTeams: teamCount,
      };
    });
  }

  static async create(
    eventId: string,
    organizerId: string,
    data: z.infer<typeof createJuryMemberSchema>,
  ) {
    await ensureEventOwnership(eventId, organizerId);

    const count = await prisma.juryMember.count({ where: { eventId } });
    if (count >= MAX_JURY) {
      throw ApiError.badRequest(`Maximum ${MAX_JURY} jury members allowed per event`);
    }

    const token = generateToken();

    return prisma.juryMember.create({
      data: {
        eventId,
        name: data.name,
        email: data.email,
        token,
      },
    });
  }

  static async update(
    eventId: string,
    juryId: string,
    organizerId: string,
    data: z.infer<typeof updateJuryMemberSchema>,
  ) {
    await ensureEventOwnership(eventId, organizerId);

    const jury = await prisma.juryMember.findFirst({
      where: { id: juryId, eventId },
    });

    if (!jury) {
      throw ApiError.notFound('Jury member not found');
    }

    return prisma.juryMember.update({
      where: { id: juryId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.email !== undefined && { email: data.email }),
      },
    });
  }

  static async delete(eventId: string, juryId: string, organizerId: string) {
    await ensureEventOwnership(eventId, organizerId);

    const jury = await prisma.juryMember.findFirst({
      where: { id: juryId, eventId },
    });

    if (!jury) {
      throw ApiError.notFound('Jury member not found');
    }

    await prisma.juryMember.delete({ where: { id: juryId } });
  }

  static async regenerateToken(eventId: string, juryId: string, organizerId: string) {
    await ensureEventOwnership(eventId, organizerId);

    const jury = await prisma.juryMember.findFirst({
      where: { id: juryId, eventId },
    });

    if (!jury) {
      throw ApiError.notFound('Jury member not found');
    }

    const token = generateToken();

    return prisma.juryMember.update({
      where: { id: juryId },
      data: { token },
    });
  }

  static async getQrCode(eventId: string, juryId: string, organizerId: string) {
    await ensureEventOwnership(eventId, organizerId);

    const jury = await prisma.juryMember.findFirst({
      where: { id: juryId, eventId },
      select: { token: true, name: true },
    });

    if (!jury) {
      throw ApiError.notFound('Jury member not found');
    }

    const juryUrl = `${config.BASE_URL}/jury/${jury.token}`;
    const qrDataUrl = await QRCode.toDataURL(juryUrl, {
      width: 300,
      margin: 2,
    });

    return {
      name: jury.name,
      url: juryUrl,
      qrCode: qrDataUrl,
    };
  }

  static async getActivity(eventId: string, organizerId: string) {
    await ensureEventOwnership(eventId, organizerId);

    const juryMembers = await prisma.juryMember.findMany({
      where: { eventId },
      select: {
        id: true,
        name: true,
        firstLogin: true,
        lastActive: true,
        evaluations: {
          select: {
            teamId: true,
            status: true,
          },
        },
      },
    });

    const onlineIds = getOnlineJuryIds(eventId);

    return juryMembers.map((j) => ({
      id: j.id,
      name: j.name,
      firstLogin: j.firstLogin,
      lastActive: j.lastActive,
      isOnline: onlineIds.has(j.id),
      evaluations: j.evaluations.map((e) => ({
        teamId: e.teamId,
        status: e.status,
      })),
    }));
  }
}
