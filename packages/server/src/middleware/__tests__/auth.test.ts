import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authOrganizer, authJury } from '../auth.js';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ApiError } from '../../utils/errors.js';

vi.mock('../../config.js', () => ({
  config: { JWT_SECRET: 'test_secret' },
}));

vi.mock('jsonwebtoken', () => ({
  default: {
    verify: vi.fn(),
  },
}));

vi.mock('../../prisma.js', () => {
  return {
    prisma: {
      juryMember: {
        findUnique: vi.fn(),
      },
    },
  };
});

describe('Auth Middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = { headers: {} };
    res = {};
    next = vi.fn();
    vi.clearAllMocks();
  });

  describe('authOrganizer', () => {
    it('should pass if valid token with organizer role', async () => {
      req.headers!.authorization = 'Bearer valid_token';
      vi.mocked(jwt.verify).mockReturnValue({
        sub: '123',
        organizerId: '123',
        role: 'organizer',
      } as never);

      await authOrganizer(req as Request, res as Response, next);

      expect(req.organizer).toEqual({ organizerId: '123' });
      expect(next).toHaveBeenCalledWith();
    });

    it('should throw if no token', async () => {
      await authOrganizer(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
    });

    it('should throw if invalid token', async () => {
      req.headers!.authorization = 'Bearer invalid_token';
      vi.mocked(jwt.verify).mockImplementation(() => { throw new Error(); });

      await authOrganizer(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
    });

    it('should throw if token has wrong role', async () => {
      req.headers!.authorization = 'Bearer wrong_role_token';
      vi.mocked(jwt.verify).mockReturnValue({
        sub: '123',
        organizerId: '123',
        role: 'jury',
      } as never);

      await authOrganizer(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      const error = (next as ReturnType<typeof vi.fn>).mock.calls[0][0] as ApiError;
      expect(error.message).toBe('Invalid token role');
    });
  });

  describe('authJury', () => {
    it('should pass if valid token', async () => {
      const { prisma } = await import('../../prisma.js');
      req.headers!['x-jury-token'] = 'valid_jury_token';
      vi.mocked(prisma.juryMember.findUnique).mockResolvedValue({
        id: 'jury1',
        eventId: 'event1',
      } as never);

      await authJury(req as Request, res as Response, next);

      expect(req.jury).toEqual({ juryMemberId: 'jury1', eventId: 'event1' });
      expect(next).toHaveBeenCalledWith();
    });

    it('should throw if no token header', async () => {
      await authJury(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
    });

    it('should throw if jury member not found', async () => {
      const { prisma } = await import('../../prisma.js');
      req.headers!['x-jury-token'] = 'invalid_jury_token';
      vi.mocked(prisma.juryMember.findUnique).mockResolvedValue(null);

      await authJury(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
    });
  });
});
