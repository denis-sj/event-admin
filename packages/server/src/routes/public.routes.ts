import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { DiplomaService } from '../services/diploma.service.js';

const verifyParamValidation = z.object({
  params: z.object({ code: z.string().min(1) }),
});

export const publicRoutes = Router();

// GET /api/public/verify/:code — verify diploma authenticity
publicRoutes.get('/verify/:code', validate(verifyParamValidation), async (req, res, next) => {
  try {
    const data = await DiplomaService.verify(req.params.code as string);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});
