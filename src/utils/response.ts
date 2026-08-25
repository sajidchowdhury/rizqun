import type { Response } from 'express';

/**
 * Send a success response with a standard envelope.
 *
 * Example:
 *   sendSuccess(res, { user }, 'Login successful');
 *   // → 200 { success: true, message: 'Login successful', data: { user } }
 */
export function sendSuccess<T>(res: Response, data: T, message = 'OK', status = 200): Response {
  return res.status(status).json({
    success: true,
    message,
    data,
  });
}

/**
 * Send an error response with a standard envelope.
 *
 * Example:
 *   sendError(res, 400, 'Invalid email');
 *   // → 400 { success: false, message: 'Invalid email' }
 */
export function sendError(res: Response, status: number, message: string): Response {
  return res.status(status).json({
    success: false,
    message,
  });
}
