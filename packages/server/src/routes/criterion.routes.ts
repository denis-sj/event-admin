import { Router } from 'express';
import { authOrganizer } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  CriterionService,
  createCriterionValidation,
  updateCriterionValidation,
  deleteCriterionValidation,
  reorderCriteriaValidation,
  criteriaEventParamValidation,
} from '../services/criterion.service.js';

export const criterionRoutes = Router({ mergeParams: true });

// All routes require organizer authentication
criterionRoutes.use(authOrganizer);

// GET /api/organizer/events/:eventId/criteria — list criteria
criterionRoutes.get('/', validate(criteriaEventParamValidation), async (req, res, next) => {
  try {
    const criteria = await CriterionService.list(req.params.eventId as string, req.organizer!.organizerId);
    res.json({ success: true, data: criteria });
  } catch (error) {
    next(error);
  }
});

// POST /api/organizer/events/:eventId/criteria — create criterion
criterionRoutes.post('/', validate(createCriterionValidation), async (req, res, next) => {
  try {
    const criterion = await CriterionService.create(
      req.params.eventId as string,
      req.organizer!.organizerId,
      req.body,
    );
    res.status(201).json({ success: true, data: criterion });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/organizer/events/:eventId/criteria/:criterionId — update criterion
criterionRoutes.patch('/:criterionId', validate(updateCriterionValidation), async (req, res, next) => {
  try {
    const criterion = await CriterionService.update(
      req.params.eventId as string,
      req.params.criterionId as string,
      req.organizer!.organizerId,
      req.body,
    );
    res.json({ success: true, data: criterion });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/organizer/events/:eventId/criteria/:criterionId — delete criterion
criterionRoutes.delete('/:criterionId', validate(deleteCriterionValidation), async (req, res, next) => {
  try {
    await CriterionService.delete(
      req.params.eventId as string,
      req.params.criterionId as string,
      req.organizer!.organizerId,
    );
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// PUT /api/organizer/events/:eventId/criteria/order — reorder criteria
criterionRoutes.put('/order', validate(reorderCriteriaValidation), async (req, res, next) => {
  try {
    const criteria = await CriterionService.reorder(
      req.params.eventId as string,
      req.organizer!.organizerId,
      req.body.criterionIds,
    );
    res.json({ success: true, data: criteria });
  } catch (error) {
    next(error);
  }
});
