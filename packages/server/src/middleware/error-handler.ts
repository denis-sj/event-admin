import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import multer from 'multer';
import { ERROR_CODES, type ApiError } from '@ideathon/shared';

export function errorHandler(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error('Error:', err);

  let statusCode = 500;
  let errorResponse: ApiError['error'] = {
    code: ERROR_CODES.INTERNAL_ERROR,
    message: 'Internal server error',
  };

  if (err instanceof ZodError) {
    statusCode = 400;
    errorResponse = {
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'Validation failed',
      details: err.issues,
    };
  } else if (err instanceof multer.MulterError) {
    statusCode = 400;
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'File too large'
      : `Upload error: ${err.message}`;
    errorResponse = {
      code: err.code === 'LIMIT_FILE_SIZE' ? ERROR_CODES.FILE_TOO_LARGE : ERROR_CODES.VALIDATION_ERROR,
      message,
    };
  } else if (err.status && typeof err.status === 'number') {
    // Handling custom error objects with a status property
    statusCode = err.status;
    errorResponse = {
      code: err.code || ERROR_CODES.INTERNAL_ERROR,
      message: err.message || 'Error',
      details: err.details,
    };
  } else if (err instanceof Error && err.message.includes('Invalid file type')) {
    statusCode = 400;
    errorResponse = {
      code: ERROR_CODES.VALIDATION_ERROR,
      message: err.message,
    };
  }

  res.status(statusCode).json({
    success: false,
    error: errorResponse,
  });
}
