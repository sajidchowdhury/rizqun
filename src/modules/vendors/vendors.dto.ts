import { z } from 'zod';

// ─── Phone validation ───────────────────────────────────────────
// Same regex as auth.dto.ts — accept local (01XXXXXXXXX) or international (+8801XXXXXXXXX)
const bangladeshiPhoneRegex = /^(\+?880|0)1[3-9]\d{8}$/;

// WhatsApp number: E.164 format without the leading '+', e.g. '8801712345678'.
// Must start with country code (no '+' prefix), digits only, length 10-15.
const whatsappNumberRegex = /^\d{10,15}$/;

// ─── Create ──────────────────────────────────────────────────────

export const createVendorSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(200),
  phone: z
    .string()
    .trim()
    .regex(bangladeshiPhoneRegex, 'Phone must be a valid Bangladeshi number (e.g. 017XXXXXXXX)'),
  whatsappNumber: z
    .string()
    .trim()
    .regex(whatsappNumberRegex, 'WhatsApp number must be 10-15 digits with no + or spaces')
    .nullable()
    .optional(),
  category: z.enum(['grocery', 'medicine', 'other']),
  isActive: z.boolean().optional().default(true),
});

export type CreateVendorInput = z.infer<typeof createVendorSchema>;

// ─── Update ──────────────────────────────────────────────────────
// All fields optional — partial update.

export const updateVendorSchema = z
  .object({
    name: z.string().trim().min(2).max(200).optional(),
    phone: z
      .string()
      .trim()
      .regex(bangladeshiPhoneRegex, 'Phone must be a valid Bangladeshi number')
      .optional(),
    whatsappNumber: z
      .string()
      .trim()
      .regex(whatsappNumberRegex, 'WhatsApp number must be 10-15 digits with no + or spaces')
      .nullable()
      .optional(),
    category: z.enum(['grocery', 'medicine', 'other']).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateVendorInput = z.infer<typeof updateVendorSchema>;

// ─── List query ─────────────────────────────────────────────────

export const listVendorsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  category: z.enum(['grocery', 'medicine', 'other']).optional(),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  search: z.string().trim().optional(),
});

export type ListVendorsQuery = z.infer<typeof listVendorsQuerySchema>;
