import { z } from 'zod';

/**
 * Category form schemas — mirrors backend `createCategorySchema` /
 * `updateCategorySchema` (see rizqun/src/modules/categories/categories.dto.ts).
 */

export const createCategorySchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2, 'Slug must be at least 2 characters')
    .max(50)
    .regex(/^[a-z0-9_-]+$/, 'Slug must be lowercase alphanumeric (a-z, 0-9, _, -)'),
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
});

export type CreateCategoryForm = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z
  .object({
    slug: z
      .string()
      .trim()
      .min(2, 'Slug must be at least 2 characters')
      .max(50)
      .regex(/^[a-z0-9_-]+$/, 'Slug must be lowercase alphanumeric (a-z, 0-9, _, -)')
      .optional(),
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateCategoryForm = z.infer<typeof updateCategorySchema>;
