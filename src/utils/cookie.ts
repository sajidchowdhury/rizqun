import { env } from '../config/env';

/**
 * Cookie options for the refresh token.
 *
 * - httpOnly: prevents JS access (XSS can't steal it)
 * - secure:   only sent over HTTPS (in production)
 * - sameSite: 'strict' prevents CSRF (cookie only sent on same-site requests)
 * - path: '/auth/refresh' — cookie is sent ONLY to the refresh endpoint,
 *         not on every API call. This limits blast radius if any other endpoint
 *         has a CSRF vulnerability.
 */
export const REFRESH_COOKIE_NAME = 'rizqun_refresh';

export function refreshCookieOptions(token: string) {
  return {
    name: REFRESH_COOKIE_NAME,
    value: token,
    options: {
      httpOnly: true,
      secure: env.isProd,
      sameSite: 'strict' as const,
      path: '/auth/refresh',
      maxAge: 7 * 24 * 60 * 60, // 7 days (matches JWT_REFRESH_TTL), in seconds
    },
  };
}

/**
 * Options for clearing the refresh cookie. Must match the original path/sameSite
 * exactly, otherwise the browser won't actually delete the cookie.
 */
export const clearRefreshCookieOptions = {
  httpOnly: true,
  secure: env.isProd,
  sameSite: 'strict' as const,
  path: '/auth/refresh',
};
