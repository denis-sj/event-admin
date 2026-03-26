import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from '../auth.service.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { ApiError } from '../../utils/errors.js';

vi.mock('../../config.js', () => ({
  config: { JWT_SECRET: 'test_secret' },
}));

vi.mock('../../prisma.js', () => {
  return {
    prisma: {
      organizer: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
    },
  };
});

vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
}));

vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn(),
    verify: vi.fn(),
  },
}));

describe('AuthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('register', () => {
    it('should create an organizer and return a token', async () => {
      // Setup mock implementation
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.organizer.findUnique).mockResolvedValue(null);
      vi.mocked(bcrypt.hash).mockResolvedValue('hashed_password' as never);
      vi.mocked(prisma.organizer.create).mockResolvedValue({
        id: '123',
        email: 'test@test.com',
        name: 'Test',
        passwordHash: 'hashed_password',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.mocked(jwt.sign).mockReturnValue('mock_token' as never);

      const result = await AuthService.register({
        email: 'test@test.com',
        password: 'password123',
        name: 'Test',
      });

      expect(prisma.organizer.create).toHaveBeenCalledWith({
        data: {
          email: 'test@test.com',
          name: 'Test',
          passwordHash: 'hashed_password',
        },
      });
      expect(result.token).toBe('mock_token');
      expect(result.organizer.email).toBe('test@test.com');
    });

    it('should throw conflict if email exists', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.organizer.findUnique).mockResolvedValue({
        id: '123',
        email: 'test@test.com',
      } as any);

      await expect(
        AuthService.register({
          email: 'test@test.com',
          password: 'password123',
          name: 'Test',
        })
      ).rejects.toThrow(ApiError);
    });
  });

  describe('login', () => {
    it('should login and return token', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.organizer.findUnique).mockResolvedValue({
        id: '123',
        email: 'test@test.com',
        name: 'Test',
        passwordHash: 'hashed_password',
      } as any);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
      vi.mocked(jwt.sign).mockReturnValue('mock_token' as never);

      const result = await AuthService.login({
        email: 'test@test.com',
        password: 'password123',
      });

      expect(result.token).toBe('mock_token');
    });

    it('should throw if invalid password', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.organizer.findUnique).mockResolvedValue({
        id: '123',
        email: 'test@test.com',
        passwordHash: 'hashed_password',
      } as any);
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

      await expect(
        AuthService.login({
          email: 'test@test.com',
          password: 'wrong',
        })
      ).rejects.toThrow('Invalid email or password');
    });
  });
});