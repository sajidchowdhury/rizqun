import { z } from 'zod';

/**
 * Product form schemas — mirrors backend `createProductSchema` /
 * `updateProductSchema` (see rizqun/src/modules/products/products.dto.ts).
 */

export const createProductSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(500, 'Name must be at most 500 characters'),
  sku: z.string().trim().min(1, 'SKU cannot be empty if provided').max(100).optional(),
  price: z
    .number({ invalid_type_error: 'Price must be a number' })
    .min(0, 'Price must be >= 0')
    .max(99999999.99, 'Price must be <= 99,999,999.99'),
  categoryId: z.number({ invalid_type_error: 'Category is required' }).int().positive(),
  vendorId: z.number({ invalid_type_error: 'Vendor is required' }).int().positive(),
  unit: z.string().trim().min(1).max(50),
  isActive: z.boolean(),
});

export type CreateProductForm = z.infer<typeof createProductSchema>;

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

export type UpdateProductForm = z.infer<typeof updateProductSchema>;

/**
 * Quick-add product — used by the operator during a call when a
 * customer asks for a product that's not in the catalog. Creates
 * a real product (active, in the catalog) AND lets the operator add
 * it to the cart in one flow.
 *
 * Mirrors backend `quickAddProductSchema`:
 *   - name: required, 2-500 chars
 *   - price: required, >= 0, <= 99,999,999.99
 *   - vendorId: required, positive int
 *   - categorySlug: required (NOT categoryId — operators don't know
 *     internal IDs)
 *   - unit: optional, defaults to 'pcs' via the backend
 *   - sku: optional — backend auto-generates as QUICK-{userId}-{ts}
 *     if not provided
 */
export const quickAddProductSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(500, 'Name must be at most 500 characters'),
  price: z
    .number({ invalid_type_error: 'Price must be a number' })
    .min(0, 'Price must be >= 0')
    .max(99999999.99, 'Price must be <= 99,999,999.99'),
  vendorId: z.number({ invalid_type_error: 'Vendor is required' }).int().positive(),
  categorySlug: z.string({ invalid_type_error: 'Category is required' }).trim().min(1),
  unit: z.string().trim().min(1).max(50).optional(),
  // SKU: optional. Empty string is valid (treated as "not provided" —
  // the backend auto-generates one). If a value IS provided, it must be
  // 1-100 chars (enforced by the backend, not here, to avoid zodResolver
  // typing issues with .refine()).
  sku: z.string().trim().max(100).optional(),
});

export type QuickAddProductForm = z.infer<typeof quickAddProductSchema>;
