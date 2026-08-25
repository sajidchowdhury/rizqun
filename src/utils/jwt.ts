import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from './AppError';

// jsonwebtoken's TS types use a branded `StringValue` for `expiresIn` from the `ms` package.
// We just want to pass a plain env string ("15m", "7d"). Cast via `as SignOptions`.
const ACCESS_OPTS: SignOptions = { expiresIn: env.jwt.accessTtl } as SignOptions;
const REFRESH_OPTS: SignOptions = { expiresIn: env.jwt.refreshTtl } as SignOptions;

// ─── Token payloads ────────────────────────────────────────────

export interface AccessTokenPayload {
  userId: number;
  role: string;
  // categoryAccess stored in token so middleware can scope queries without re-fetching user
  categoryAccess: string[];
}

export interface RefreshTokenPayload {
  userId: number;
  // random nonce prevents identical refresh tokens for the same user
  nonce: string;
}

// ─── Sign ──────────────────────────────────────────────────────

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.jwt.accessSecret, ACCESS_OPTS);
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, env.jwt.refreshSecret, REFRESH_OPTS);
}

// ─── Verify ────────────────────────────────────────────────────

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.jwt.accessSecret) as JwtPayload;
    return {
      userId: decoded.userId as number,
      role: decoded.role as string,
      categoryAccess: decoded.categoryAccess as string[],
    };
  } catch {
    throw new AppError(401, 'Invalid or expired access token');
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const decoded = jwt.verify(token, env.jwt.refreshSecret) as JwtPayload;
    return {
      userId: decoded.userId as number,
      nonce: decoded.nonce as string,
    };
  } catch {
    throw new AppError(401, 'Invalid or expired refresh token');
  }
}

// ─── Nonce generator (for refresh tokens) ─────────────────────

export function generateNonce(): string {
  // 16 random bytes → 32 hex chars. Good enough to differentiate concurrent sessions.
  return crypto.randomUUID().replace(/-/g, '');
}
