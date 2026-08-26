import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { AppError } from '../utils/AppError';

// `Request` augmentation is in `./types.d.ts` — TypeScript auto-discovers .d.ts
// files via the tsconfig include pattern, so no runtime import is needed.

/**
 * Verify the `Authorization: Bearer <token>` header, decode the JWT, and
 * set `req.user` to the payload.
 *
 * Usage:
 *   router.get('/protected', authenticate, handler);
 *   // or applied globally:
 *   app.use('/api', authenticate);
 *
 * Throws 401 if:
 *   - header is missing
 *   - header is malformed (not "Bearer xxx")
 *   - token is invalid or expired
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (!header) {
    throw new AppError(401, 'Authorization header missing');
  }

  // Must be "Bearer <token>"
  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    throw new AppError(401, 'Authorization header must be "Bearer <token>"');
  }

  const token = parts[1];
  const payload = verifyAccessToken(token); // throws AppError(401) on invalid

  // Attach to req.user — type comes from the augmentation in types.d.ts
  req.user = payload;

  next();
}
