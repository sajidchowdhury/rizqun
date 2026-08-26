import { z } from 'zod';

const bangladeshiPhoneRegex = /^(\+?880|0)1[3-9]\d{8}$/;

/**
 * Create user schema — mirrors backend `createUserSchema`.
 * Used by super_admin to create new operators.
 */

export const createUserSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(200),
  email: z.string().trim().toLowerCase().email('Invalid email'),
  phone: z
    .string()
    .trim()
    .regex(bangladeshiPhoneRegex, 'Phone must be a valid Bangladeshi number (e.g. 017XXXXXXXX)'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  role: z.enum(['user', 'super_admin']),
  categoryAccess: z.array(z.string()),
  isActive: z.boolean(),
});

export type CreateUserForm = z.infer<typeof createUserSchema>;

/**
 * Update user schema — all fields optional. Password is optional
 * (only set if the admin is changing it).
 */
export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  phone: z.string().trim().regex(bangladeshiPhoneRegex).optional(),
  password: z.string().min(8).max(128).optional(),
  role: z.enum(['user', 'super_admin']).optional(),
  categoryAccess: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

export type UpdateUserForm = z.infer<typeof updateUserSchema>;
