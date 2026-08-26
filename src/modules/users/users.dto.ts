import { z } from 'zod';

// ─── Phone validation (reused across modules) ──────────────────
const bangladeshiPhoneRegex = /^(\+?880|0)1[3-9]\d{8}$/;

// ─── Create user (POST /users) ────────────────────────────────

export const createUserSchema = z.strictObject({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(200),
  email: z.string().trim().toLowerCase().email('Invalid email'),
  phone: z.string().trim().regex(bangladeshiPhoneRegex, 'Phone must be a valid Bangladeshi number'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  role: z.enum(['user', 'super_admin']).default('user'),
  categoryAccess: z.array(z.string()).default([]),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

// ─── Update user (PATCH /users/:id) ───────────────────────────

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(2).max(200).optional(),
    email: z.string().trim().toLowerCase().email().optional(),
    phone: z
      .string()
      .trim()
      .regex(bangladeshiPhoneRegex, 'Phone must be a valid Bangladeshi number')
      .optional(),
    password: z.string().min(8).max(128).optional(),
    role: z.enum(['user', 'super_admin']).optional(),
    categoryAccess: z.array(z.string()).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

// ─── List query ───────────────────────────────────────────────

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  role: z.enum(['user', 'super_admin']).optional(),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  search: z.string().trim().optional(),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

// ─── Public user shape (response) ────────────────────────────

export interface PublicUser {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: string;
  categoryAccess: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
