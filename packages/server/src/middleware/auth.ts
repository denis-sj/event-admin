import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { prisma } from '../prisma.js';
import { ApiError } from '../utils/errors.js';

export interface OrganizerPayload {
  organizerId: string;
}

interface OrganizerJwtPayload {
  sub: string;
  organizerId: string;
  role: string;
}

// Extend Express Request object
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      organizer?: OrganizerPayload;
      jury?: { juryMemberId: string; eventId: string };
    }
  }
}

export const authOrganizer = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw ApiError.unauthorized('Missing or invalid Authorization header');
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, config.JWT_SECRET) as OrganizerJwtPayload;

      if (decoded.role !== 'organizer') {
        throw ApiError.unauthorized('Invalid token role');
      }

      req.organizer = { organizerId: decoded.sub };
      next();
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw ApiError.unauthorized('Invalid or expired token');
    }
  } catch (error) {
    next(error);
  }
};

export const authJury = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.headers['x-jury-token'] as string | undefined;
    if (!token) {
      throw ApiError.unauthorized('Missing X-Jury-Token header');
    }

    const juryMember = await prisma.juryMember.findUnique({
      where: { token },
      select: { id: true, eventId: true },
    });

    if (!juryMember) {
      throw ApiError.unauthorized('Invalid jury token');
    }

    req.jury = {
      juryMemberId: juryMember.id,
      eventId: juryMember.eventId,
    };
    
    next();
  } catch (error) {
    next(error);
  }
};
