import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wrap an async Express handler so that rejected promises are forwarded
 * to Express's error-handling middleware.
 *
 * Express 4 does NOT auto-catch async errors — without this wrapper, any
 * thrown error becomes an "Unhandled Rejection" and the request hangs forever.
 *
 * Usage:
 *   router.post('/login', asyncHandler(login));
 *
 * In Express 5 this wrapper is no longer needed (async support is built-in).
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void> | void
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
