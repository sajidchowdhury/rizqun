import bcrypt from 'bcryptjs';
import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/AppError';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  generateNonce,
  type AccessTokenPayload,
} from '../../utils/jwt';
import { type UserRole } from '@prisma/client';
import type { RegisterInput, LoginInput } from './auth.dto';

const BCRYPT_COST = 12;

// ─── Public user shape (never leak passwordHash) ────────────────

export interface PublicUser {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  categoryAccess: string[];
  isActive: boolean;
}

function toPublicUser(user: {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  categoryAccess: unknown;
  isActive: boolean;
}): PublicUser {
  // Prisma returns Json as `unknown` for JSONB columns — coerce to string[]
  const access = Array.isArray(user.categoryAccess) ? (user.categoryAccess as string[]) : [];
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    categoryAccess: access,
    isActive: user.isActive,
  };
}

// ─── Register ──────────────────────────────────────────────────

export async function registerUser(
  input: RegisterInput,
): Promise<{ user: PublicUser; accessToken: string }> {
  // Check for existing email
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new AppError(409, 'Email already registered');
  }

  // Validate categoryAccess — only allow known slugs + 'all'
  const validSlugs = await prisma.category.findMany({ select: { slug: true } });
  const validSet = new Set<string>([...validSlugs.map((c) => c.slug), 'all']);
  const invalid = input.categoryAccess.filter((s) => !validSet.has(s));
  if (invalid.length) {
    throw new AppError(400, `Invalid category slugs: ${invalid.join(', ')}`);
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      phone: input.phone,
      passwordHash,
      role: input.role,
      categoryAccess: input.categoryAccess,
    },
  });

  const publicUser = toPublicUser(user);
  const accessToken = signAccessToken({
    userId: user.id,
    role: user.role,
    categoryAccess: publicUser.categoryAccess,
  });

  return { user: publicUser, accessToken };
}

// ─── Login ──────────────────────────────────────────────────────

export async function loginUser(
  input: LoginInput,
): Promise<{ user: PublicUser; accessToken: string; refreshToken: string }> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    // Same error for "wrong email" and "wrong password" to prevent enumeration
    throw new AppError(401, 'Invalid email or password');
  }

  if (!user.isActive) {
    throw new AppError(403, 'Account is deactivated');
  }

  const passwordOk = await bcrypt.compare(input.password, user.passwordHash);
  if (!passwordOk) {
    throw new AppError(401, 'Invalid email or password');
  }

  const publicUser = toPublicUser(user);

  const accessTokenPayload: AccessTokenPayload = {
    userId: user.id,
    role: user.role,
    categoryAccess: publicUser.categoryAccess,
  };
  const accessToken = signAccessToken(accessTokenPayload);
  const refreshToken = signRefreshToken({ userId: user.id, nonce: generateNonce() });

  return { user: publicUser, accessToken, refreshToken };
}

// ─── Refresh ────────────────────────────────────────────────────

export async function refreshTokens(
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const payload = verifyRefreshToken(refreshToken);

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user || !user.isActive) {
    throw new AppError(401, 'User not found or deactivated');
  }

  // Re-fetch categoryAccess in case it changed since the refresh token was issued
  const access = Array.isArray(user.categoryAccess) ? (user.categoryAccess as string[]) : [];

  const accessToken = signAccessToken({
    userId: user.id,
    role: user.role,
    categoryAccess: access,
  });

  // Rotate refresh token: each refresh issues a new one (token rotation defends against replay)
  const newRefreshToken = signRefreshToken({ userId: user.id, nonce: generateNonce() });

  return { accessToken, refreshToken: newRefreshToken };
}

// ─── Get current user ──────────────────────────────────────────

export async function getUserById(userId: number): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) {
    throw new AppError(404, 'User not found');
  }
  return toPublicUser(user);
}
