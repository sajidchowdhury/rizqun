import type { Request, Response, NextFunction } from 'express';

/**
 * Reads `req.user.categoryAccess` (set by `authenticate`) and produces
 * a normalized filter object on `req.categoryFilter`.
 *
 * Two cases:
 *   1. categoryAccess includes 'all' → hasAll=true, slugs=[] (no filter needed)
 *   2. otherwise → hasAll=false, slugs=[...specific slugs]
 *
 * Product/order queries use this like so:
 *
 *   if (req.categoryFilter?.hasAll) {
 *     // no filter
 *   } else {
 *     prisma.product.findMany({
 *       where: { category: { slug: { in: req.categoryFilter!.slugs } } }
 *     })
 *   }
 *
 * Must be used AFTER `authenticate`.
 */
export function categoryScope(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    // Defensive — authenticate should have run first
    req.categoryFilter = { hasAll: false, slugs: [] };
    next();
    return;
  }

  const access: string[] = Array.isArray(req.user.categoryAccess) ? req.user.categoryAccess : [];

  if (access.includes('all')) {
    req.categoryFilter = { hasAll: true, slugs: [] };
  } else {
    req.categoryFilter = { hasAll: false, slugs: access };
  }

  next();
}
