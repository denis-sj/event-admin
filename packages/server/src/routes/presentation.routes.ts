import { Router } from 'express';
import { authOrganizer } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  PresentationService,
  presentationEventParamValidation,
  setPresentationOrderValidation,
  setCurrentTeamValidation,
  timerActionValidation,
  scoringControlValidation,
} from '../services/presentation.service.js';

export const presentationRoutes = Router({ mergeParams: true });

// All routes require organizer authentication
presentationRoutes.use(authOrganizer);

// PUT /api/organizer/events/:eventId/presentation/order — set presentation order
presentationRoutes.put(
  '/order',
  validate(setPresentationOrderValidation),
  async (req, res, next) => {
    try {
      const teams = await PresentationService.setPresentationOrder(
        req.params.eventId as string,
        req.organizer!.organizerId,
        req.body,
      );
      res.json({ success: true, data: teams });
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/organizer/events/:eventId/presentation/current — set current team
presentationRoutes.post(
  '/current',
  validate(setCurrentTeamValidation),
  async (req, res, next) => {
    try {
      const event = await PresentationService.setCurrentTeam(
        req.params.eventId as string,
        req.organizer!.organizerId,
        req.body.teamId,
      );
      res.json({ success: true, data: event });
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/organizer/events/:eventId/presentation/timer — timer action (start/pause/reset)
presentationRoutes.post(
  '/timer',
  validate(timerActionValidation),
  async (req, res, next) => {
    try {
      const state = await PresentationService.timerAction(
        req.params.eventId as string,
        req.organizer!.organizerId,
        req.body.action,
      );
      res.json({ success: true, data: state });
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/organizer/events/:eventId/presentation/timer — get timer state
presentationRoutes.get(
  '/timer',
  validate(presentationEventParamValidation),
  async (req, res, next) => {
    try {
      const state = await PresentationService.getTimerState(
        req.params.eventId as string,
        req.organizer!.organizerId,
      );
      res.json({ success: true, data: state });
    } catch (error) {
      next(error);
    }
  },
);

// PATCH /api/organizer/events/:eventId/presentation/scoring — open/close scoring
presentationRoutes.patch(
  '/scoring',
  validate(scoringControlValidation),
  async (req, res, next) => {
    try {
      const result = await PresentationService.setScoringStatus(
        req.params.eventId as string,
        req.organizer!.organizerId,
        req.body.open,
      );
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);
