import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { errorHandler } from './middleware/error-handler.js';
import { authRoutes } from './routes/auth.routes.js';
import { eventRoutes } from './routes/event.routes.js';
import { criterionRoutes } from './routes/criterion.routes.js';
import { taskRoutes } from './routes/task.routes.js';
import { teamRoutes } from './routes/team.routes.js';
import { importRoutes } from './routes/import.routes.js';
import { juryRoutes } from './routes/jury.routes.js';
import { presentationRoutes } from './routes/presentation.routes.js';
import { evaluationRoutes } from './routes/evaluation.routes.js';
import { resultsRoutes } from './routes/results.routes.js';
import { diplomaRoutes } from './routes/diploma.routes.js';
import { publicRoutes } from './routes/public.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure upload dir exists
const uploadPath = path.resolve(__dirname, '..', config.UPLOAD_DIR);
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

export const app = express();

// Middleware
app.use(helmet({ crossOriginResourcePolicy: false })); // allow images to be loaded
app.use(cors({
  origin: config.NODE_ENV === 'production' ? config.BASE_URL : true,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use('/uploads', express.static(uploadPath));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/organizer/events', eventRoutes);
app.use('/api/organizer/events/:eventId/criteria', criterionRoutes);
app.use('/api/organizer/events/:eventId/tasks', taskRoutes);
app.use('/api/organizer/events/:eventId/teams', teamRoutes);
app.use('/api/organizer/events/:eventId/import', importRoutes);
app.use('/api/organizer/events/:eventId/jury', juryRoutes);
app.use('/api/organizer/events/:eventId/presentation', presentationRoutes);
app.use('/api/organizer/events/:eventId/results', resultsRoutes);
app.use('/api/organizer/events/:eventId/diplomas', diplomaRoutes);
app.use('/api/jury/events/:eventId', evaluationRoutes);
app.use('/api/jury', evaluationRoutes); // discover endpoint (no eventId needed)
app.use('/api/public', publicRoutes);

// Error handling
app.use(errorHandler);
