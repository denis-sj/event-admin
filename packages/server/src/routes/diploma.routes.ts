import { Router } from 'express';
import type { Writable } from 'stream';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { authOrganizer } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { config } from '../config.js';
import {
  DiplomaService,
  diplomaSettingsParamValidation,
  updateDiplomaSettingsValidation,
  diplomaTeamParamValidation,
} from '../services/diploma.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const bgDir = path.resolve(__dirname, '../..', config.UPLOAD_DIR, 'diploma-backgrounds');
if (!fs.existsSync(bgDir)) {
  fs.mkdirSync(bgDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: bgDir,
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `bg-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB for backgrounds
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and WebP are allowed.'));
    }
  },
});

export const diplomaRoutes = Router({ mergeParams: true });

// All routes require organizer authentication
diplomaRoutes.use(authOrganizer);

// GET /api/organizer/events/:eventId/diplomas/settings — get diploma settings
diplomaRoutes.get(
  '/settings',
  validate(diplomaSettingsParamValidation),
  async (req, res, next) => {
    try {
      const settings = await DiplomaService.getSettings(
        req.params.eventId as string,
        req.organizer!.organizerId,
      );
      res.json({ success: true, data: settings });
    } catch (error) {
      next(error);
    }
  },
);

// PUT /api/organizer/events/:eventId/diplomas/settings — update diploma settings
diplomaRoutes.put(
  '/settings',
  validate(updateDiplomaSettingsValidation),
  async (req, res, next) => {
    try {
      const settings = await DiplomaService.updateSettings(
        req.params.eventId as string,
        req.organizer!.organizerId,
        req.body,
      );
      res.json({ success: true, data: settings });
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/organizer/events/:eventId/diplomas/background — upload background image
diplomaRoutes.post(
  '/background',
  validate(diplomaSettingsParamValidation),
  upload.single('background'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'No file uploaded' },
        });
        return;
      }

      const relativePath = `/uploads/diploma-backgrounds/${req.file.filename}`;
      const settings = await DiplomaService.uploadBackground(
        req.params.eventId as string,
        req.organizer!.organizerId,
        relativePath,
      );
      res.json({ success: true, data: settings });
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/organizer/events/:eventId/diplomas/preview — generate preview PDF
diplomaRoutes.get(
  '/preview',
  validate(diplomaSettingsParamValidation),
  async (req, res, next) => {
    try {
      const pdfBuffer = await DiplomaService.generatePreview(
        req.params.eventId as string,
        req.organizer!.organizerId,
      );

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="diploma-preview.pdf"');
      res.send(pdfBuffer);
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/organizer/events/:eventId/diplomas/generate — generate all diplomas
diplomaRoutes.post(
  '/generate',
  validate(diplomaSettingsParamValidation),
  async (req, res, next) => {
    try {
      const diplomas = await DiplomaService.generateAll(
        req.params.eventId as string,
        req.organizer!.organizerId,
      );
      res.json({ success: true, data: diplomas });
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/organizer/events/:eventId/diplomas/download-all — download all diplomas as ZIP
// Must be defined BEFORE /:teamId to avoid being captured as a teamId parameter
diplomaRoutes.get(
  '/download-all',
  validate(diplomaSettingsParamValidation),
  async (req, res, next) => {
    try {
      const { stream, filename } = await DiplomaService.downloadAll(
        req.params.eventId as string,
        req.organizer!.organizerId,
      );

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      stream.pipe(res as unknown as Writable);
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/organizer/events/:eventId/diplomas/:teamId — download diploma PDF for a specific team
diplomaRoutes.get(
  '/:teamId',
  validate(diplomaTeamParamValidation),
  async (req, res, next) => {
    try {
      const diploma = await DiplomaService.getDiplomaForTeam(
        req.params.eventId as string,
        req.organizer!.organizerId,
        req.params.teamId as string,
      );

      if (!diploma.filePath) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Diploma PDF not generated yet' },
        });
        return;
      }

      const absolutePath = path.resolve(
        __dirname, '../..', config.UPLOAD_DIR,
        diploma.filePath.replace('/uploads/', ''),
      );

      if (!fs.existsSync(absolutePath)) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Diploma PDF file not found on disk' },
        });
        return;
      }

      res.setHeader('Content-Type', 'application/pdf');
      const safeAscii = `diploma-${req.params.teamId}.pdf`;
      const utfName = `diploma-${diploma.team.name}.pdf`;
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(utfName)}`,
      );
      const fileStream = fs.createReadStream(absolutePath);
      fileStream.pipe(res as unknown as Writable);
    } catch (error) {
      next(error);
    }
  },
);
