import { z } from 'zod';

const bangladeshiPhoneRegex = /^(\+?880|0)1[3-9]\d{8}$/;

/**
 * Create user schema — mirrors backend `createUserSchema`.
 * Used by super_admin to create new operators.
 *
 * Password is REQUIRED on create (min 8 chars).
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
 * Edit user schema — same as create, but password is OPTIONAL.
 *
 * When editing, the operator leaves the password field blank to keep
 * the current one. The form sends `password: ''` in that case, and
 * the dialog strips it before submitting (see user-form-dialog.tsx).
 *
 * We use a separate schema for edit so zod doesn't reject the empty
 * password with "Password must be at least 8 characters" — that was
 * the "broken dialog" bug.
 */
export const editUserSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(200),
  email: z.string().trim().toLowerCase().email('Invalid email'),
  phone: z
    .string()
    .trim()
    .regex(bangladeshiPhoneRegex, 'Phone must be a valid Bangladeshi number (e.g. 017XXXXXXXX)'),
  // Password optional in edit mode. Empty string = keep current password.
  password: z.string().max(128).optional(),
  role: z.enum(['user', 'super_admin']),
  categoryAccess: z.array(z.string()),
  isActive: z.boolean(),
});

export type EditUserForm = z.infer<typeof editUserSchema>;

/**
 * Update user schema — all fields optional. Used by the backend
 * for PATCH /users/:id. Kept here for reference / type alignment.
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
