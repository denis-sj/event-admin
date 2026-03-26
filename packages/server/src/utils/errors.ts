import { ERROR_CODES } from '@ideathon/shared';

export class ApiError extends Error {
  public status: number;
  public code: string;
  public details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, ERROR_CODES.VALIDATION_ERROR, message, details);
  }

  static unauthorized(message = 'Unauthorized') {
    return new ApiError(401, ERROR_CODES.UNAUTHORIZED, message);
  }

  static forbidden(message = 'Forbidden') {
    return new ApiError(403, ERROR_CODES.FORBIDDEN, message);
  }

  static notFound(message = 'Not found') {
    return new ApiError(404, ERROR_CODES.NOT_FOUND, message);
  }

  static conflict(message: string, code: string = ERROR_CODES.CONFLICT) {
    return new ApiError(409, code, message);
  }
}
