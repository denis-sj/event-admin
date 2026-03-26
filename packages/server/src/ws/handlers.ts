import type { WSClient } from './server.js';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { prisma } from '../prisma.js';
import { PresentationService } from '../services/presentation.service.js';

interface WSMessage {
  type: string;
  role?: string;
  token?: string;
  eventId?: string;
}

interface OrganizerJwtPayload {
  sub: string;
  organizerId: string;
  role: string;
}

export async function handleMessage(ws: WSClient, message: WSMessage) {
  if (message.type === 'auth') {
    const { token, role } = message;

    if (!token || !role) {
      ws.send(JSON.stringify({ type: 'auth_error', message: 'Missing token or role' }));
      ws.close();
      return;
    }

    try {
      if (role === 'organizer') {
        if (!message.eventId) {
          ws.send(JSON.stringify({ type: 'auth_error', message: 'Missing eventId for organizer' }));
          ws.close();
          return;
        }

        const decoded = jwt.verify(token, config.JWT_SECRET) as OrganizerJwtPayload;

        if (decoded.role !== 'organizer') {
          throw new Error('Invalid token role');
        }

        // Verify that the organizer owns the requested event
        const event = await prisma.event.findUnique({
          where: { id: message.eventId },
          select: { organizerId: true },
        });

        if (!event || event.organizerId !== decoded.sub) {
          ws.send(JSON.stringify({ type: 'auth_error', message: 'Event not found or access denied' }));
          ws.close();
          return;
        }

        ws.role = 'ORGANIZER';
        ws.organizerId = decoded.sub;
        ws.eventId = message.eventId;

        ws.send(JSON.stringify({ type: 'auth_ok', eventId: message.eventId }));
      } else if (role === 'jury') {
        const jury = await prisma.juryMember.findUnique({
          where: { token },
          select: { id: true, eventId: true, firstLogin: true },
        });

        if (!jury) {
          throw new Error('Invalid jury token');
        }

        ws.role = 'JURY';
        ws.juryMemberId = jury.id;
        ws.eventId = jury.eventId;

        // Update lastActive; set firstLogin only on first connection
        const updateData: { lastActive: Date; firstLogin?: Date } = {
          lastActive: new Date(),
        };
        if (!jury.firstLogin) {
          updateData.firstLogin = new Date();
        }
        await prisma.juryMember.update({
          where: { id: jury.id },
          data: updateData,
        });

        ws.send(JSON.stringify({ type: 'auth_ok', eventId: jury.eventId }));

        // Send current timer & scoring snapshot so the juror doesn't miss state
        const timerSnapshot = PresentationService.getTimerSnapshot(jury.eventId);
        if (timerSnapshot) {
          ws.send(JSON.stringify({ type: 'timer:state', payload: timerSnapshot }));
        }

        const event = await prisma.event.findUnique({
          where: { id: jury.eventId },
          select: { currentTeamId: true, scoringTeamId: true },
        });
        if (event) {
          ws.send(JSON.stringify({
            type: 'scoring:status',
            payload: { scoringTeamId: event.scoringTeamId, isOpen: event.scoringTeamId !== null },
          }));

          // Always send team:current so the client clears stale persisted state
          let currentTeam = null;
          if (event.currentTeamId) {
            currentTeam = await prisma.team.findUnique({
              where: { id: event.currentTeamId },
              include: { participants: true, task: true },
            });
          }
          ws.send(JSON.stringify({
            type: 'team:current',
            payload: { team: currentTeam },
          }));
        }
      } else {
        ws.send(JSON.stringify({ type: 'auth_error', message: 'Unknown role' }));
        ws.close();
      }
    } catch {
      ws.send(JSON.stringify({ type: 'auth_error', message: 'Authentication failed' }));
      ws.close();
    }
  }
}
