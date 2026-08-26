import { z } from 'zod';

const bangladeshiPhoneRegex = /^(\+?880|0)1[3-9]\d{8}$/;

/**
 * Finalize order schema — mirrors backend's `finalizeOrderSchema`
 * (see rizqun/src/modules/orders/orders.dto.ts).
 *
 * customerName: 2-200 chars
 * customerPhone: Bangladeshi phone (017XXXXXXXX or +88017XXXXXXXX)
 * customerAddress: optional, max 500 chars
 * deliveryFee: number >= 0
 * items: array of { productId, qty }, min 1 item
 */

export const finalizeOrderSchema = z.object({
  customerName: z.string().trim().min(2, 'Customer name must be at least 2 characters').max(200),
  customerPhone: z
    .string()
    .trim()
    .regex(bangladeshiPhoneRegex, 'Must be a valid Bangladeshi number (e.g. 017XXXXXXXX)'),
  customerAddress: z.string().trim().max(500).optional(),
  deliveryFee: z.number().min(0).max(99999999.99),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        qty: z.number().int().positive().max(9999),
      }),
    )
    .min(1, 'At least one item is required'),
});

export type FinalizeOrderForm = z.infer<typeof finalizeOrderSchema>;
