import { Router } from 'express';
import { AuthService, registerSchema, loginSchema } from '../services/auth.service.js';
import { validate } from '../middleware/validate.js';
import { loginLimiter } from '../middleware/rate-limit.js';

export const authRoutes = Router();

authRoutes.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
    const result = await AuthService.register(req.body);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

authRoutes.post('/login', loginLimiter, validate(loginSchema), async (req, res, next) => {
  try {
    const result = await AuthService.login(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});
