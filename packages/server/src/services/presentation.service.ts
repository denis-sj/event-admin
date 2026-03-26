import { z } from 'zod';
import { prisma } from '../prisma.js';
import { ApiError } from '../utils/errors.js';
import { Broadcaster } from '../ws/broadcaster.js';
import {
  setPresentationOrderSchema,
  WS_EVENTS,
  ERROR_CODES,
} from '@ideathon/shared';

// --- Timer in-memory state ---

interface TimerState {
  eventId: string;
  duration: number; // total duration in seconds
  remaining: number; // remaining seconds
  isRunning: boolean;
  intervalHandle?: ReturnType<typeof setInterval>;
}

const timers = new Map<string, TimerState>();

function broadcastTimerState(eventId: string, state: TimerState) {
  Broadcaster.broadcastToEvent(eventId, WS_EVENTS.TIMER_STATE, {
    duration: state.duration,
    remaining: state.remaining,
    isRunning: state.isRunning,
  });
}

// --- Validation schemas ---

export const presentationEventParamValidation = z.object({
  params: z.object({ eventId: z.string().uuid() }),
});

export const setPresentationOrderValidation = z.object({
  body: setPresentationOrderSchema,
  params: z.object({ eventId: z.string().uuid() }),
});

export const setCurrentTeamValidation = z.object({
  body: z.object({ teamId: z.string().uuid().nullable() }),
  params: z.object({ eventId: z.string().uuid() }),
});

export const timerActionValidation = z.object({
  body: z.object({
    action: z.enum(['start', 'pause', 'reset']),
  }),
  params: z.object({ eventId: z.string().uuid() }),
});

export const scoringControlValidation = z.object({
  body: z.object({
    open: z.boolean(),
  }),
  params: z.object({ eventId: z.string().uuid() }),
});

async function ensureEventOwnership(eventId: string, organizerId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { organizerId: true, status: true, currentTeamId: true, scoringTeamId: true, timerDuration: true },
  });

  if (!event) {
    throw ApiError.notFound('Event not found');
  }

  if (event.organizerId !== organizerId) {
    throw ApiError.forbidden('Access denied');
  }

  return event;
}

export class PresentationService {
  static async setPresentationOrder(
    eventId: string,
    organizerId: string,
    data: z.infer<typeof setPresentationOrderSchema>,
  ) {
    await ensureEventOwnership(eventId, organizerId);

    // Verify all teamIds belong to this event
    const teams = await prisma.team.findMany({
      where: { eventId },
      select: { id: true },
    });

    const eventTeamIds = new Set(teams.map((t) => t.id));
    for (const id of data.teamIds) {
      if (!eventTeamIds.has(id)) {
        throw ApiError.badRequest(`Team ${id} not found in this event`);
      }
    }

    // Update presentation order using a transaction
    await prisma.$transaction(
      data.teamIds.map((teamId, index) =>
        prisma.team.update({
          where: { id: teamId },
          data: { presentationOrder: index + 1 },
        }),
      ),
    );

    // Also set null for any teams not in the list
    const orderedSet = new Set(data.teamIds);
    const unorderedTeams = teams.filter((t) => !orderedSet.has(t.id));
    if (unorderedTeams.length > 0) {
      await prisma.$transaction(
        unorderedTeams.map((t) =>
          prisma.team.update({
            where: { id: t.id },
            data: { presentationOrder: null },
          }),
        ),
      );
    }

    return prisma.team.findMany({
      where: { eventId },
      orderBy: { presentationOrder: { sort: 'asc', nulls: 'last' } },
      select: { id: true, name: true, presentationOrder: true },
    });
  }

  static async setCurrentTeam(
    eventId: string,
    organizerId: string,
    teamId: string | null,
  ) {
    const event = await ensureEventOwnership(eventId, organizerId);

    if (event.status !== 'ACTIVE' && event.status !== 'SCORING_CLOSED') {
      throw ApiError.conflict(
        'Event must be ACTIVE or SCORING_CLOSED to set current team',
        ERROR_CODES.EVENT_NOT_ACTIVE,
      );
    }

    if (teamId !== null) {
      const team = await prisma.team.findFirst({
        where: { id: teamId, eventId },
      });
      if (!team) {
        throw ApiError.notFound('Team not found in this event');
      }
    }

    // When changing current team, close scoring for the previous team
    const updatedEvent = await prisma.event.update({
      where: { id: eventId },
      data: {
        currentTeamId: teamId,
        scoringTeamId: null,
      },
    });

    // Broadcast to all participants
    let currentTeam = null;
    if (teamId) {
      currentTeam = await prisma.team.findUnique({
        where: { id: teamId },
        include: {
          participants: true,
          task: true,
        },
      });
    }

    Broadcaster.broadcastToEvent(eventId, WS_EVENTS.TEAM_CURRENT, {
      team: currentTeam,
    });

    Broadcaster.broadcastToEvent(eventId, WS_EVENTS.SCORING_STATUS, {
      scoringTeamId: null,
      isOpen: false,
    });

    return updatedEvent;
  }

  static async timerAction(
    eventId: string,
    organizerId: string,
    action: 'start' | 'pause' | 'reset',
  ) {
    const event = await ensureEventOwnership(eventId, organizerId);

    let timer = timers.get(eventId);

    switch (action) {
      case 'start': {
        if (!timer) {
          timer = {
            eventId,
            duration: event.timerDuration,
            remaining: event.timerDuration,
            isRunning: false,
          };
          timers.set(eventId, timer);
        }

        if (timer.isRunning) {
          return { duration: timer.duration, remaining: timer.remaining, isRunning: true };
        }

        if (timer.remaining <= 0) {
          timer.remaining = timer.duration;
        }

        timer.isRunning = true;
        timer.intervalHandle = setInterval(() => {
          if (!timer || timer.remaining <= 0) {
            if (timer) {
              timer.isRunning = false;
              if (timer.intervalHandle) {
                clearInterval(timer.intervalHandle);
                timer.intervalHandle = undefined;
              }
              broadcastTimerState(eventId, timer);
            }
            return;
          }
          timer.remaining -= 1;
          broadcastTimerState(eventId, timer);
        }, 1000);

        broadcastTimerState(eventId, timer);
        return { duration: timer.duration, remaining: timer.remaining, isRunning: true };
      }

      case 'pause': {
        if (!timer || !timer.isRunning) {
          const state = timer || { duration: event.timerDuration, remaining: event.timerDuration, isRunning: false };
          return { duration: state.duration, remaining: state.remaining, isRunning: false };
        }

        timer.isRunning = false;
        if (timer.intervalHandle) {
          clearInterval(timer.intervalHandle);
          timer.intervalHandle = undefined;
        }

        broadcastTimerState(eventId, timer);
        return { duration: timer.duration, remaining: timer.remaining, isRunning: false };
      }

      case 'reset': {
        if (timer?.intervalHandle) {
          clearInterval(timer.intervalHandle);
        }

        const newTimer: TimerState = {
          eventId,
          duration: event.timerDuration,
          remaining: event.timerDuration,
          isRunning: false,
        };
        timers.set(eventId, newTimer);

        broadcastTimerState(eventId, newTimer);
        return { duration: newTimer.duration, remaining: newTimer.remaining, isRunning: false };
      }
    }
  }

  static async getTimerState(eventId: string, organizerId: string) {
    await ensureEventOwnership(eventId, organizerId);

    const timer = timers.get(eventId);
    if (!timer) {
      return null;
    }
    return {
      duration: timer.duration,
      remaining: timer.remaining,
      isRunning: timer.isRunning,
    };
  }

  static async setScoringStatus(
    eventId: string,
    organizerId: string,
    open: boolean,
  ) {
    const event = await ensureEventOwnership(eventId, organizerId);

    if (event.status !== 'ACTIVE') {
      throw ApiError.conflict(
        'Event must be ACTIVE to control scoring',
        ERROR_CODES.EVENT_NOT_ACTIVE,
      );
    }

    let scoringTeamId: string | null = null;

    if (open) {
      if (!event.currentTeamId) {
        throw ApiError.badRequest('No current team set — cannot open scoring');
      }
      scoringTeamId = event.currentTeamId;
    }

    await prisma.event.update({
      where: { id: eventId },
      data: { scoringTeamId },
    });

    Broadcaster.broadcastToEvent(eventId, WS_EVENTS.SCORING_STATUS, {
      scoringTeamId,
      isOpen: open,
    });

    return { scoringTeamId, isOpen: open };
  }

  /**
   * Get the current in-memory timer state for an event (no auth check).
   * Used internally, e.g. to send a snapshot to a newly connected WS client.
   */
  static getTimerSnapshot(eventId: string) {
    const timer = timers.get(eventId);
    if (!timer) return null;
    return {
      duration: timer.duration,
      remaining: timer.remaining,
      isRunning: timer.isRunning,
    };
  }

  // Cleanup timer on event close/completion.
  // Broadcasts a final stopped timer:state so connected clients clear their UI.
  static cleanupTimer(eventId: string) {
    const timer = timers.get(eventId);
    if (timer) {
      if (timer.intervalHandle) {
        clearInterval(timer.intervalHandle);
      }
      // Emit one final stopped state so jurors see the timer disappear
      Broadcaster.broadcastToEvent(eventId, WS_EVENTS.TIMER_STATE, {
        duration: timer.duration,
        remaining: timer.remaining,
        isRunning: false,
      });
      timers.delete(eventId);
    }
  }
}
