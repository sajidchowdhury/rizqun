import { z } from 'zod';

// ─── Phone validation ───────────────────────────────────────────
// Accepts both local (01XXXXXXXXX) and international (+8801XXXXXXXXX) Bangladeshi numbers.

const bangladeshiPhoneRegex = /^(\+?880|0)1[3-9]\d{8}$/;

export const phoneSchema = z
  .string()
  .trim()
  .regex(bangladeshiPhoneRegex, 'Phone must be a valid Bangladeshi number (e.g. 017XXXXXXXX or +88017XXXXXXXX)');

// ─── Register ──────────────────────────────────────────────────
// Used by POST /auth/register (super_admin only — enforced in Session 1.3).

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().trim().toLowerCase().email('Invalid email'),
  phone: phoneSchema,
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  role: z.enum(['user', 'super_admin']).default('user'),
  categoryAccess: z.array(z.string()).default([]),
});

export type RegisterInput = z.infer<typeof registerSchema>;

// ─── Login ──────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;

// ─── Refresh ────────────────────────────────────────────────────
// Body is empty — refresh token comes from the httpOnly cookie.
// We still export an empty schema for symmetry / future use.

export const refreshSchema = z.object({}).optional();

export type RefreshInput = z.infer<typeof refreshSchema>;
