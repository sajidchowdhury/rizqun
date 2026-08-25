import { Router } from 'express';
import { register, login, refresh, logout, me } from './auth.controller';
import { asyncHandler } from '../../utils/asyncHandler';
import { authenticate } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/role.middleware';
import { categoryScope } from '../../middlewares/category-scope.middleware';

const router = Router();

// ─── Public routes ─────────────────────────────────────────────
// Login + refresh don't need auth (obviously).
// Logout is intentionally public so a client can clear its cookie even if its
// token has already expired.
router.post('/login', asyncHandler(login));
router.post('/refresh', asyncHandler(refresh));
router.post('/logout', asyncHandler(logout));

// ─── Authenticated routes ───────────────────────────────────────
// Register is super_admin-only — operators cannot create accounts.
// `authenticate` and `requireRole` are sync, so no asyncHandler needed on them,
// but the controller (`register`) IS async, so it must be wrapped.
router.post('/register', authenticate, requireRole('super_admin'), asyncHandler(register));

// /auth/me requires a valid access token + sets categoryFilter for future use.
router.get('/me', authenticate, categoryScope, asyncHandler(me));

export default router;
