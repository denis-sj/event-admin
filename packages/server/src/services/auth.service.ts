import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma.js';
import { config } from '../config.js';
import { ApiError } from '../utils/errors.js';
import { z } from 'zod';

export const registerSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8),
    name: z.string().min(2).max(100),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string(),
  }),
});

export class AuthService {
  static async register(data: z.infer<typeof registerSchema>['body']) {
    const existingOrganizer = await prisma.organizer.findUnique({
      where: { email: data.email },
    });

    if (existingOrganizer) {
      throw ApiError.conflict('Organizer with this email already exists');
    }

    const passwordHash = await bcrypt.hash(data.password, 12);

    const organizer = await prisma.organizer.create({
      data: {
        email: data.email,
        passwordHash,
        name: data.name,
      },
    });

    const token = jwt.sign(
      { sub: organizer.id, organizerId: organizer.id, role: 'organizer' },
      config.JWT_SECRET,
      { expiresIn: '24h' },
    );

    return {
      organizer: {
        id: organizer.id,
        email: organizer.email,
        name: organizer.name,
      },
      token,
    };
  }

  static async login(data: z.infer<typeof loginSchema>['body']) {
    const organizer = await prisma.organizer.findUnique({
      where: { email: data.email },
    });

    if (!organizer) {
      throw ApiError.unauthorized('Invalid email or password');
    }

    const isValidPassword = await bcrypt.compare(data.password, organizer.passwordHash);

    if (!isValidPassword) {
      throw ApiError.unauthorized('Invalid email or password');
    }

    const token = jwt.sign(
      { sub: organizer.id, organizerId: organizer.id, role: 'organizer' },
      config.JWT_SECRET,
      { expiresIn: '24h' },
    );

    return {
      organizer: {
        id: organizer.id,
        email: organizer.email,
        name: organizer.name,
      },
      token,
    };
  }
}
