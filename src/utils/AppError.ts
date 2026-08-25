/**
 * Custom application error.
 *
 * Usage:
 *   throw new AppError(404, 'Order not found');
 *   throw new AppError(409, 'Order is locked', { code: 'ORDER_LOCKED' });
 *
 * The global error handler in app.ts will catch this and convert it
 * to a JSON response with the correct status code.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code?: string;
  public readonly isOperational: boolean;

  constructor(statusCode: number, message: string, options?: { code?: string; isOperational?: boolean }) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = options?.code;
    this.isOperational = options?.isOperational ?? true;
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Bad request', code?: string): AppError {
    return new AppError(400, message, { code });
  }

  static unauthorized(message = 'Unauthorized'): AppError {
    return new AppError(401, message);
  }

  static forbidden(message = 'Forbidden'): AppError {
    return new AppError(403, message);
  }

  static notFound(message = 'Not found'): AppError {
    return new AppError(404, message);
  }

  static conflict(message = 'Conflict', code?: string): AppError {
    return new AppError(409, message, { code });
  }
}
