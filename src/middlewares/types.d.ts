// Express Request augmentation — adds `req.user` typed as AccessTokenPayload
// so any controller can access it without per-file interfaces.
//
// Loaded automatically when `auth.middleware.ts` is imported (which always happens
// because the `authenticate` middleware is applied to all protected routes).

import type { AccessTokenPayload } from '../utils/jwt';

declare module 'express-serve-static-core' {
  interface Request {
    user?: AccessTokenPayload;
    // Set by `categoryScope` middleware. Used by product/order queries to filter
    // by user's categoryAccess without re-reading the token on every query.
    categoryFilter?: {
      hasAll: boolean; // true if user has ['all'] access (no filter needed)
      slugs: string[]; // specific category slugs the user can access (empty if hasAll)
    };
  }
}
