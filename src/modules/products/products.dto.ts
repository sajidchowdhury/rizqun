import { z } from 'zod';

// ─── Create ─────────────────────────────────────────────────────

export const createProductSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(500, 'Name must be at most 500 characters'),
  sku: z.string().trim().min(1, 'SKU cannot be empty if provided').max(100).optional(),
  price: z.number().min(0, 'Price must be >= 0').max(99999999.99, 'Price must be <= 99,999,999.99'),
  categoryId: z.number().int().positive('categoryId must be a positive integer'),
  vendorId: z.number().int().positive('vendorId must be a positive integer'),
  unit: z.string().trim().min(1).max(50).default('pcs'),
  isActive: z.boolean().optional().default(true),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

// ─── Update ─────────────────────────────────────────────────────

export const updateProductSchema = z
  .object({
    name: z.string().trim().min(2).max(500).optional(),
    sku: z.string().trim().min(1).max(100).nullable().optional(),
    price: z.number().min(0).max(99999999.99).optional(),
    categoryId: z.number().int().positive().optional(),
    vendorId: z.number().int().positive().optional(),
    unit: z.string().trim().min(1).max(50).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateProductInput = z.infer<typeof updateProductSchema>;

// ─── List query ─────────────────────────────────────────────────

export const listProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  categoryId: z.coerce.number().int().positive().optional(),
  vendorId: z.coerce.number().int().positive().optional(),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  // category slug, e.g. 'grocery' — used by category-scope middleware to filter
  category: z.string().trim().optional(),
  search: z.string().trim().optional(),
});

export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
