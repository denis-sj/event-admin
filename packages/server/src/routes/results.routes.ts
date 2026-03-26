import { Router } from 'express';
import { authOrganizer } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  ResultsService,
  resultsQueryValidation,
  resultsExportValidation,
} from '../services/results.service.js';

export const resultsRoutes = Router({ mergeParams: true });

// All routes require organizer authentication
resultsRoutes.use(authOrganizer);

// GET /api/organizer/events/:eventId/results — get results table
resultsRoutes.get('/', validate(resultsQueryValidation), async (req, res, next) => {
  try {
    const results = await ResultsService.getResults(
      req.params.eventId as string,
      req.organizer!.organizerId,
      req.query.taskId as string | undefined,
    );
    res.json({ success: true, data: results });
  } catch (error) {
    next(error);
  }
});

// GET /api/organizer/events/:eventId/results/export — export results as XLSX or CSV
resultsRoutes.get('/export', validate(resultsExportValidation), async (req, res, next) => {
  try {
    const format = (req.query.format as 'xlsx' | 'csv') || 'xlsx';
    const { buffer, filename, contentType } = await ResultsService.exportResults(
      req.params.eventId as string,
      req.organizer!.organizerId,
      format,
      req.query.taskId as string | undefined,
    );

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});
