import { z } from 'zod';

/**
 * Vendor form schemas — mirrors backend `createVendorSchema` /
 * `updateVendorSchema` (see rizqun/src/modules/vendors/vendors.dto.ts).
 *
 * NOTE: We keep the schemas simpler than the backend's (no .transform or
 * .refine on whatsappNumber) because @hookform/resolvers/zod and
 * react-hook-form's generic types don't compose nicely with those zod
 * features — they end up with TFieldValues mismatches. Empty-string
 * cleanup + WhatsApp regex validation happen in the form submit handler.
 */

const bangladeshiPhoneRegex = /^(\+?880|0)1[3-9]\d{8}$/;

export const createVendorSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(200),
  phone: z
    .string()
    .trim()
    .regex(bangladeshiPhoneRegex, 'Phone must be a valid Bangladeshi number (e.g. 017XXXXXXXX)'),
  // WhatsApp is optional — empty string is allowed (form converts to
  // undefined on submit). Regex validation done in the form submit handler
  // to avoid zodResolver typing issues.
  whatsappNumber: z.string().trim().optional(),
  category: z.enum(['grocery', 'medicine', 'other']),
  isActive: z.boolean(),
});

export type CreateVendorForm = z.infer<typeof createVendorSchema>;

export const updateVendorSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  phone: z
    .string()
    .trim()
    .regex(bangladeshiPhoneRegex, 'Phone must be a valid Bangladeshi number')
    .optional(),
  whatsappNumber: z.string().trim().optional(),
  category: z.enum(['grocery', 'medicine', 'other']).optional(),
  isActive: z.boolean().optional(),
});

export type UpdateVendorForm = z.infer<typeof updateVendorSchema>;

/** WhatsApp E.164 regex — exposed so the form can validate at submit time. */
export const whatsappNumberRegex = /^\d{10,15}$/;
