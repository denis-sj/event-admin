import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import os from 'os';
import { authOrganizer } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  ImportService,
  importPreviewValidation,
  importApplyValidation,
} from '../services/import.service.js';

const storage = multer.diskStorage({
  destination: os.tmpdir(),
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `import-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowedExtensions = ['.csv', '.xlsx', '.xls'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only CSV and XLSX/XLS are supported.'));
    }
  },
});

export const importRoutes = Router({ mergeParams: true });

// All routes require organizer authentication
importRoutes.use(authOrganizer);

// POST /api/organizer/events/:eventId/import/preview — upload file and get preview
importRoutes.post(
  '/preview',
  validate(importPreviewValidation),
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'No file uploaded' },
        });
        return;
      }

      const result = await ImportService.preview(
        req.params.eventId as string,
        req.organizer!.organizerId,
        req.file.path,
        req.file.originalname,
      );

      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/organizer/events/:eventId/import/apply — apply import with mapping
importRoutes.post(
  '/apply',
  validate(importApplyValidation),
  async (req, res, next) => {
    try {
      const result = await ImportService.apply(
        req.params.eventId as string,
        req.organizer!.organizerId,
        req.body,
      );

      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);
