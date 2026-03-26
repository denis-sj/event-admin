import { Router } from 'express';
import { authJury } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  EvaluationService,
  evaluationEventParamValidation,
  evaluationTeamParamValidation,
  saveScoresValidation,
  confirmEvaluationValidation,
} from '../services/evaluation.service.js';

export const evaluationRoutes = Router({ mergeParams: true });

// All routes require jury authentication
evaluationRoutes.use(authJury);

// GET /api/jury/discover — discover event by jury token (no eventId required)
evaluationRoutes.get('/discover', async (req, res, next) => {
  try {
    const event = await EvaluationService.getEventForJury(req.jury!.eventId);
    res.json({ success: true, data: event });
  } catch (error) {
    next(error);
  }
});

// GET /api/jury/events/:eventId — get event data for jury
evaluationRoutes.get(
  '/',
  validate(evaluationEventParamValidation),
  async (req, res, next) => {
    try {
      // Verify jury belongs to this event
      if (req.jury!.eventId !== req.params.eventId) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Access denied to this event' },
        });
      }

      const event = await EvaluationService.getEventForJury(req.params.eventId as string);
      res.json({ success: true, data: event });
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/jury/events/:eventId/teams — get teams with evaluation status
evaluationRoutes.get(
  '/teams',
  validate(evaluationEventParamValidation),
  async (req, res, next) => {
    try {
      if (req.jury!.eventId !== req.params.eventId) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Access denied to this event' },
        });
      }

      const teams = await EvaluationService.getTeamsForJury(
        req.params.eventId as string,
        req.jury!.juryMemberId,
      );
      res.json({ success: true, data: teams });
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/jury/events/:eventId/teams/:teamId — get single team with evaluation
evaluationRoutes.get(
  '/teams/:teamId',
  validate(evaluationTeamParamValidation),
  async (req, res, next) => {
    try {
      if (req.jury!.eventId !== req.params.eventId) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Access denied to this event' },
        });
      }

      const team = await EvaluationService.getTeamForJury(
        req.params.eventId as string,
        req.params.teamId as string,
        req.jury!.juryMemberId,
      );
      res.json({ success: true, data: team });
    } catch (error) {
      next(error);
    }
  },
);

// PUT /api/jury/events/:eventId/teams/:teamId/scores — save scores (draft)
evaluationRoutes.put(
  '/teams/:teamId/scores',
  validate(saveScoresValidation),
  async (req, res, next) => {
    try {
      if (req.jury!.eventId !== req.params.eventId) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Access denied to this event' },
        });
      }

      const evaluation = await EvaluationService.saveScores(
        req.params.eventId as string,
        req.params.teamId as string,
        req.jury!.juryMemberId,
        req.body,
      );
      res.json({ success: true, data: evaluation });
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/jury/events/:eventId/teams/:teamId/confirm — confirm evaluation
evaluationRoutes.post(
  '/teams/:teamId/confirm',
  validate(confirmEvaluationValidation),
  async (req, res, next) => {
    try {
      if (req.jury!.eventId !== req.params.eventId) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Access denied to this event' },
        });
      }

      const evaluation = await EvaluationService.confirmEvaluation(
        req.params.eventId as string,
        req.params.teamId as string,
        req.jury!.juryMemberId,
      );
      res.json({ success: true, data: evaluation });
    } catch (error) {
      next(error);
    }
  },
);
