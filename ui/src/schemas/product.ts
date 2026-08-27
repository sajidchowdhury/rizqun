import { z } from 'zod';

/**
 * Product form schemas — mirrors backend `createProductSchema` /
 * `updateProductSchema` (see rizqun/src/modules/products/products.dto.ts).
 *
 * Phase 1 (2026-08-28): now uses the 3-price model:
 *   - purchasePrice (p.price): what we pay the vendor (default 0)
 *   - salePrice     (s.price): what we charge the customer (required)
 *   - discountPrice (optional): if set, that's the active customer price
 *
 * Note: discountPrice is optional in the form (operator can leave it
 * blank), but when sent to the backend it becomes either `null` (clear)
 * or `undefined` (leave as-is) — see ProductFormDialog for the
 * conversion logic.
 */

const priceField = z
  .number({ invalid_type_error: 'Price must be a number' })
  .min(0, 'Price must be >= 0')
  .max(99999999.99, 'Price must be <= 99,999,999.99');

export const createProductSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(500, 'Name must be at most 500 characters'),
  sku: z.string().trim().min(1, 'SKU cannot be empty if provided').max(100).optional(),
  // purchasePrice is required in the form (defaults to 0 via defaultValues).
  // We don't use `.optional().default(0)` here because zodResolver + react-hook-form
  // have a known type mismatch when the input type differs from the output type.
  purchasePrice: priceField,
  salePrice: priceField,
  // Optional + nullable — empty form field → null → no discount active.
  discountPrice: priceField.nullable().optional(),
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
    purchasePrice: priceField.optional(),
    salePrice: priceField.optional(),
    discountPrice: priceField.nullable().optional(),
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
 * Phase 1 (2026-08-28): mirrors the backend `quickAddProductSchema`:
 *   - salePrice: required (what we charge the customer)
 *   - purchasePrice: optional (default 0 — operators fill in via the
 *     morning workflow later)
 *   - discountPrice: optional, nullable (no discount by default)
 */
export const quickAddProductSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(500, 'Name must be at most 500 characters'),
  salePrice: priceField,
  purchasePrice: priceField.optional().default(0),
  discountPrice: priceField.nullable().optional(),
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
