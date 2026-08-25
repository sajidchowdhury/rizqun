import type { Request, Response } from 'express';
import { registerSchema, loginSchema } from './auth.dto';
import {
  registerUser,
  loginUser,
  refreshTokens,
  getUserById,
} from './auth.service';
import { sendSuccess, sendError } from '../../utils/response';
import { AppError } from '../../utils/AppError';
import { REFRESH_COOKIE_NAME, refreshCookieOptions, clearRefreshCookieOptions } from '../../utils/cookie';
import type { AccessTokenPayload } from '../../utils/jwt';

// Shape of `req.user` once the auth middleware (Session 1.3) is in place.
// For now we cast manually — keep this type here so the controller is ready.
interface AuthedRequest extends Request {
  user?: AccessTokenPayload;
}

// ─── POST /auth/register ──────────────────────────────────────
// NOTE: Session 1.2 leaves this OPEN. Session 1.3 will add the
// `requireRole('super_admin')` middleware on this route.
export async function register(req: Request, res: Response): Promise<void> {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message ?? 'Invalid input');
  }

  const { user, accessToken } = await registerUser(parsed.data);
  sendSuccess(res, { user, accessToken }, 'User registered', 201);
}

// ─── POST /auth/login ─────────────────────────────────────────
export async function login(req: Request, res: Response): Promise<void> {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message ?? 'Invalid input');
  }

  const { user, accessToken, refreshToken } = await loginUser(parsed.data);

  // Set refresh token in httpOnly cookie scoped to /auth/refresh
  const cookie = refreshCookieOptions(refreshToken);
  res.cookie(cookie.name, cookie.value, cookie.options);

  sendSuccess(res, { user, accessToken }, 'Login successful');
}

// ─── POST /auth/refresh ───────────────────────────────────────
export async function refresh(req: Request, res: Response): Promise<void> {
  const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!refreshToken) {
    sendError(res, 401, 'Refresh token missing');
    return;
  }

  const { accessToken, refreshToken: newRefreshToken } = await refreshTokens(refreshToken);

  // Rotate: replace the old refresh cookie with the new one
  const cookie = refreshCookieOptions(newRefreshToken);
  res.cookie(cookie.name, cookie.value, cookie.options);

  sendSuccess(res, { accessToken }, 'Token refreshed');
}

// ─── POST /auth/logout ────────────────────────────────────────
export async function logout(_req: Request, res: Response): Promise<void> {
  res.clearCookie(REFRESH_COOKIE_NAME, clearRefreshCookieOptions);
  sendSuccess(res, null, 'Logout successful');
}

// ─── GET /auth/me ─────────────────────────────────────────────
// NOTE: Session 1.2 leaves this OPEN-ish — the auth middleware
// (added in Session 1.3) will inject `req.user`. For now we accept
// a manual `userId` from a query param so we can test the service.
export async function me(req: AuthedRequest, res: Response): Promise<void> {
  // Prefer the authenticated user (set by middleware in Session 1.3)
  const authUser = req.user;

  // Fallback for testing before middleware exists: ?userId=1
  const userId = authUser?.userId ?? Number(req.query.userId);

  if (!userId || Number.isNaN(userId)) {
    throw new AppError(401, 'Not authenticated');
  }

  const user = await getUserById(userId);
  sendSuccess(res, { user }, 'Current user');
}
