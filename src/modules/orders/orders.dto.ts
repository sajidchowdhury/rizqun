import { z } from 'zod';

// ─── Phone validation (same as auth.dto.ts) ────────────────────
const bangladeshiPhoneRegex = /^(\+?880|0)1[3-9]\d{8}$/;

// ─── Item inside the cart (sent by frontend) ───────────────────
// productId is required — quick-added products first go through POST /products/quick-add
// which creates a real Product row, so by the time finalize is called every
// cart item has a productId.

export const cartItemSchema = z.object({
  productId: z.number().int().positive('productId must be a positive integer'),
  qty: z.number().int().positive('qty must be at least 1').max(9999),
});

// ─── Finalize order (POST /orders) ─────────────────────────────

export const finalizeOrderSchema = z.object({
  customerName: z.string().trim().min(2, 'Customer name must be at least 2 characters').max(200),
  customerPhone: z
    .string()
    .trim()
    .regex(bangladeshiPhoneRegex, 'Customer phone must be a valid Bangladeshi number'),
  customerAddress: z.string().trim().max(500).optional(),
  deliveryFee: z.number().min(0).max(99999999.99).default(0),
  items: z.array(cartItemSchema).min(1, 'At least one item is required').max(500),
});

export type FinalizeOrderInput = z.infer<typeof finalizeOrderSchema>;
export type CartItemInput = z.infer<typeof cartItemSchema>;

// ─── Public order shape (response) ────────────────────────────

export interface PublicOrderItem {
  id: number;
  productId: number | null;
  vendorId: number;
  productNameSnapshot: string;
  priceSnapshot: string; // Decimal as string (JSON-safe)
  qty: number;
  lineTotal: string;
  addedAfterFinalize: boolean;
  addedAt: Date;
  vendor?: { id: number; name: string; phone: string; whatsappNumber: string | null };
}

export interface PublicOrder {
  id: number;
  orderCode: string;
  userId: number;
  customerName: string;
  customerPhone: string;
  customerAddress: string | null;
  subtotal: string;
  deliveryFee: string;
  total: string;
  status: string;
  ratingToken: string | null;
  createdAt: Date;
  deliveredAt: Date | null;
  items: PublicOrderItem[];
}

// ─── List query (GET /orders) ─────────────────────────────────

export const listOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum(['pending', 'waiting_vendor', 'preparing', 'picked_up', 'delivered', 'cancelled'])
    .optional(),
  // Filter by date range (ISO 8601)
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  // Search by customer name or phone (partial match, case-insensitive)
  search: z.string().trim().optional(),
});

export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;

// ─── Paginated list response shape ────────────────────────────

export interface OrderListItem {
  id: number;
  orderCode: string;
  userId: number;
  customerName: string;
  customerPhone: string;
  status: string;
  total: string;
  itemsCount: number;
  createdAt: Date;
  deliveredAt: Date | null;
}

export interface PaginatedOrders {
  data: OrderListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
