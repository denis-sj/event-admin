import { Router } from 'express';
import { authOrganizer } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  JuryService,
  juryEventParamValidation,
  createJuryValidation,
  updateJuryValidation,
  juryIdParamValidation,
} from '../services/jury.service.js';

export const juryRoutes = Router({ mergeParams: true });

// All routes require organizer authentication
juryRoutes.use(authOrganizer);

// GET /api/organizer/events/:eventId/jury — list jury members
juryRoutes.get('/', validate(juryEventParamValidation), async (req, res, next) => {
  try {
    const juryMembers = await JuryService.list(
      req.params.eventId as string,
      req.organizer!.organizerId,
    );
    res.json({ success: true, data: juryMembers });
  } catch (error) {
    next(error);
  }
});

// POST /api/organizer/events/:eventId/jury — add jury member
juryRoutes.post('/', validate(createJuryValidation), async (req, res, next) => {
  try {
    const jury = await JuryService.create(
      req.params.eventId as string,
      req.organizer!.organizerId,
      req.body,
    );
    res.status(201).json({ success: true, data: jury });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/organizer/events/:eventId/jury/:juryId — update jury member
juryRoutes.patch('/:juryId', validate(updateJuryValidation), async (req, res, next) => {
  try {
    const jury = await JuryService.update(
      req.params.eventId as string,
      req.params.juryId as string,
      req.organizer!.organizerId,
      req.body,
    );
    res.json({ success: true, data: jury });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/organizer/events/:eventId/jury/:juryId — delete jury member
juryRoutes.delete('/:juryId', validate(juryIdParamValidation), async (req, res, next) => {
  try {
    await JuryService.delete(
      req.params.eventId as string,
      req.params.juryId as string,
      req.organizer!.organizerId,
    );
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// POST /api/organizer/events/:eventId/jury/:juryId/regenerate-token
juryRoutes.post(
  '/:juryId/regenerate-token',
  validate(juryIdParamValidation),
  async (req, res, next) => {
    try {
      const jury = await JuryService.regenerateToken(
        req.params.eventId as string,
        req.params.juryId as string,
        req.organizer!.organizerId,
      );
      res.json({ success: true, data: jury });
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/organizer/events/:eventId/jury/:juryId/qr — get QR code
juryRoutes.get('/:juryId/qr', validate(juryIdParamValidation), async (req, res, next) => {
  try {
    const qrData = await JuryService.getQrCode(
      req.params.eventId as string,
      req.params.juryId as string,
      req.organizer!.organizerId,
    );
    res.json({ success: true, data: qrData });
  } catch (error) {
    next(error);
  }
});

// GET /api/organizer/events/:eventId/jury/activity — get jury activity
juryRoutes.get('/activity', validate(juryEventParamValidation), async (req, res, next) => {
  try {
    const activity = await JuryService.getActivity(
      req.params.eventId as string,
      req.organizer!.organizerId,
    );
    res.json({ success: true, data: activity });
  } catch (error) {
    next(error);
  }
});
