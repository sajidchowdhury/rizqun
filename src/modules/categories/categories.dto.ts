import { z } from 'zod';

// ─── Create category (POST /categories) ──────────────────────

export const createCategorySchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2, 'Slug must be at least 2 characters')
    .max(50)
    .regex(/^[a-z0-9_-]+$/, 'Slug must be lowercase alphanumeric (a-z, 0-9, _, -)'),
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

// ─── Update category (PATCH /categories/:id) ──────────────────

export const updateCategorySchema = z
  .object({
    slug: z
      .string()
      .trim()
      .min(2)
      .max(50)
      .regex(/^[a-z0-9_-]+$/, 'Slug must be lowercase alphanumeric')
      .optional(),
    name: z.string().trim().min(2).max(100).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

// ─── Public category shape ────────────────────────────────────

export interface PublicCategory {
  id: number;
  slug: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}
