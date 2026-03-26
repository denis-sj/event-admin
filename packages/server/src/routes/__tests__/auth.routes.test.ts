import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { authRoutes } from '../auth.routes.js';
import { AuthService } from '../../services/auth.service.js';
import { errorHandler } from '../../middleware/error-handler.js';

vi.mock('../../config.js', () => ({
  config: { JWT_SECRET: 'test_secret' },
}));

vi.mock('../../services/auth.service.js', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    AuthService: {
      register: vi.fn(),
      login: vi.fn(),
    },
  };
});

vi.mock('../../middleware/rate-limit.js', () => ({
  loginLimiter: (req: any, res: any, next: any) => next(),
}));

const app = express();
app.use(express.json());
app.use('/auth', authRoutes);
app.use(errorHandler);

describe('Auth Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /auth/register', () => {
    it('should register and return 201', async () => {
      vi.mocked(AuthService.register).mockResolvedValue({
        organizer: { id: '1', email: 'test@test.com', name: 'Test' },
        token: 'token',
      });

      const response = await request(app)
        .post('/auth/register')
        .send({ email: 'test@test.com', password: 'password123', name: 'Test' });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.token).toBe('token');
    });

    it('should fail validation without email', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({ password: 'password123', name: 'Test' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /auth/login', () => {
    it('should login and return 200', async () => {
      vi.mocked(AuthService.login).mockResolvedValue({
        organizer: { id: '1', email: 'test@test.com', name: 'Test' },
        token: 'token',
      });

      const response = await request(app)
        .post('/auth/login')
        .send({ email: 'test@test.com', password: 'password123' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.token).toBe('token');
    });
  });
});