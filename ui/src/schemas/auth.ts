import { z } from 'zod';

/**
 * Login form schema — mirrors the backend's `loginSchema`
 * (see `rizqun/src/modules/auth/auth.dto.ts:32`).
 *
 * Backend uses `z.strictObject` so any extra fields would be rejected.
 * We mirror the trimming + lowercase normalization on email so the
 * client-side validation matches what the server will see.
 *
 * Validation rules:
 *   - email: required, trimmed, lowercased, valid email format
 *   - password: required (min 1 char — backend doesn't enforce length on
 *     login to prevent user enumeration via password length messages)
 */
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginForm = z.infer<typeof loginSchema>;

// ─── Register schema (used by Phase 7 admin user creation) ──────────
// Mirrors backend `registerSchema`. Phone uses Bangladeshi format.
// Exported now so it's ready when Phase 7 lands.

const bangladeshiPhoneRegex = /^(\+?880|0)1[3-9]\d{8}$/;

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().trim().toLowerCase().email('Invalid email'),
  phone: z
    .string()
    .trim()
    .regex(
      bangladeshiPhoneRegex,
      'Phone must be a valid Bangladeshi number (e.g. 017XXXXXXXX or +88017XXXXXXXX)',
    ),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  role: z.enum(['user', 'super_admin']).default('user'),
  categoryAccess: z.array(z.string()).default([]),
});

export type RegisterForm = z.infer<typeof registerSchema>;
