import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import type { UserRole } from '@prisma/client';

/**
 * Factory that returns a middleware allowing only the specified roles.
 *
 * Usage:
 *   router.post('/users', authenticate, requireRole('super_admin'), handler);
 *
 * Must be used AFTER `authenticate` — reads `req.user.role`.
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new AppError(401, 'Not authenticated');
    }

    if (!allowedRoles.includes(req.user.role as UserRole)) {
      throw new AppError(403, 'Insufficient permissions');
    }

    next();
  };
}
