import { Router } from 'express';
import { authOrganizer } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  TeamService,
  teamEventParamValidation,
  createTeamValidation,
  updateTeamValidation,
  deleteTeamValidation,
  createParticipantValidation,
  updateParticipantValidation,
  deleteParticipantValidation,
} from '../services/team.service.js';

export const teamRoutes = Router({ mergeParams: true });

// All routes require organizer authentication
teamRoutes.use(authOrganizer);

// GET /api/organizer/events/:eventId/teams — list teams
teamRoutes.get('/', validate(teamEventParamValidation), async (req, res, next) => {
  try {
    const teams = await TeamService.list(req.params.eventId as string, req.organizer!.organizerId);
    res.json({ success: true, data: teams });
  } catch (error) {
    next(error);
  }
});

// GET /api/organizer/events/:eventId/teams/:teamId — get team by ID
teamRoutes.get('/:teamId', validate(deleteTeamValidation), async (req, res, next) => {
  try {
    const team = await TeamService.getById(
      req.params.eventId as string,
      req.params.teamId as string,
      req.organizer!.organizerId,
    );
    res.json({ success: true, data: team });
  } catch (error) {
    next(error);
  }
});

// POST /api/organizer/events/:eventId/teams — create team
teamRoutes.post('/', validate(createTeamValidation), async (req, res, next) => {
  try {
    const team = await TeamService.create(
      req.params.eventId as string,
      req.organizer!.organizerId,
      req.body,
    );
    res.status(201).json({ success: true, data: team });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/organizer/events/:eventId/teams/:teamId — update team
teamRoutes.patch('/:teamId', validate(updateTeamValidation), async (req, res, next) => {
  try {
    const team = await TeamService.update(
      req.params.eventId as string,
      req.params.teamId as string,
      req.organizer!.organizerId,
      req.body,
    );
    res.json({ success: true, data: team });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/organizer/events/:eventId/teams/:teamId — delete team
// Pass ?force=true to confirm deletion of teams with evaluations
teamRoutes.delete('/:teamId', validate(deleteTeamValidation), async (req, res, next) => {
  try {
    const force = req.query.force === 'true';
    await TeamService.delete(
      req.params.eventId as string,
      req.params.teamId as string,
      req.organizer!.organizerId,
      force,
    );
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// --- Participant routes (nested under teams) ---

// POST /api/organizer/events/:eventId/teams/:teamId/participants — add participant
teamRoutes.post(
  '/:teamId/participants',
  validate(createParticipantValidation),
  async (req, res, next) => {
    try {
      const participant = await TeamService.addParticipant(
        req.params.eventId as string,
        req.params.teamId as string,
        req.organizer!.organizerId,
        req.body,
      );
      res.status(201).json({ success: true, data: participant });
    } catch (error) {
      next(error);
    }
  },
);

// PATCH /api/organizer/events/:eventId/teams/:teamId/participants/:participantId — update participant
teamRoutes.patch(
  '/:teamId/participants/:participantId',
  validate(updateParticipantValidation),
  async (req, res, next) => {
    try {
      const participant = await TeamService.updateParticipant(
        req.params.eventId as string,
        req.params.teamId as string,
        req.params.participantId as string,
        req.organizer!.organizerId,
        req.body,
      );
      res.json({ success: true, data: participant });
    } catch (error) {
      next(error);
    }
  },
);

// DELETE /api/organizer/events/:eventId/teams/:teamId/participants/:participantId — delete participant
teamRoutes.delete(
  '/:teamId/participants/:participantId',
  validate(deleteParticipantValidation),
  async (req, res, next) => {
    try {
      await TeamService.deleteParticipant(
        req.params.eventId as string,
        req.params.teamId as string,
        req.params.participantId as string,
        req.organizer!.organizerId,
      );
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);
