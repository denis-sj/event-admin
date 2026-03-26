import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { authOrganizer } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { config } from '../config.js';
import {
  EventService,
  createEventValidation,
  updateEventValidation,
  updateEventStatusValidation,
  eventIdParamValidation,
} from '../services/event.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const storage = multer.diskStorage({
  destination: path.resolve(__dirname, '../..', config.UPLOAD_DIR, 'logos'),
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `logo-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and WebP are allowed.'));
    }
  },
});

export const eventRoutes = Router();

// All routes require organizer authentication
eventRoutes.use(authOrganizer);

// GET /api/organizer/events — list all events for the organizer
eventRoutes.get('/', async (req, res, next) => {
  try {
    const events = await EventService.list(req.organizer!.organizerId);
    res.json({ success: true, data: events });
  } catch (error) {
    next(error);
  }
});

// GET /api/organizer/events/:eventId — get event by ID
eventRoutes.get('/:eventId', validate(eventIdParamValidation), async (req, res, next) => {
  try {
    const event = await EventService.getById(req.params.eventId as string, req.organizer!.organizerId);
    res.json({ success: true, data: event });
  } catch (error) {
    next(error);
  }
});

// POST /api/organizer/events — create a new event
eventRoutes.post('/', validate(createEventValidation), async (req, res, next) => {
  try {
    const event = await EventService.create(req.organizer!.organizerId, req.body);
    res.status(201).json({ success: true, data: event });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/organizer/events/:eventId — update event
eventRoutes.patch('/:eventId', validate(updateEventValidation), async (req, res, next) => {
  try {
    const event = await EventService.update(req.params.eventId as string, req.organizer!.organizerId, req.body);
    res.json({ success: true, data: event });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/organizer/events/:eventId/status — update event status
eventRoutes.patch(
  '/:eventId/status',
  validate(updateEventStatusValidation),
  async (req, res, next) => {
    try {
      const event = await EventService.updateStatus(
        req.params.eventId as string,
        req.organizer!.organizerId,
        req.body.status,
      );
      res.json({ success: true, data: event });
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/organizer/events/:eventId/logo — upload event logo
eventRoutes.post(
  '/:eventId/logo',
  validate(eventIdParamValidation),
  upload.single('logo'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'No file uploaded' },
        });
        return;
      }

      const relativePath = `/uploads/logos/${req.file.filename}`;
      const event = await EventService.uploadLogo(
        req.params.eventId as string,
        req.organizer!.organizerId,
        relativePath,
      );
      res.json({ success: true, data: event });
    } catch (error) {
      next(error);
    }
  },
);
