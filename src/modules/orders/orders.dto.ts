import { z } from 'zod';

// ─── Phone validation (same as auth.dto.ts) ────────────────────
const bangladeshiPhoneRegex = /^(\+?880|0)1[3-9]\d{8}$/;

// ─── Item inside the cart (sent by frontend) ───────────────────
// productId is required — quick-added products first go through POST /products/quick-add
// which creates a real Product row, so by the time finalize is called every
// cart item has a productId.

export const cartItemSchema = z.strictObject({
  productId: z.number().int().positive('productId must be a positive integer'),
  qty: z.number().int().positive('qty must be at least 1').max(9999),
});

// ─── Finalize order (POST /orders) ─────────────────────────────

export const finalizeOrderSchema = z.strictObject({
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

// ─── Status update (PATCH /orders/:id/status) ─────────────────
//
// Allowed transitions (forward = vendor workflow, sideways = cancel):
//
//   pending        → waiting_vendor, cancelled
//   waiting_vendor → preparing, cancelled
//   preparing      → picked_up, cancelled
//   picked_up      → delivered
//   delivered      → (terminal)
//   cancelled      → (terminal)
//
// Note: once an order is `picked_up`, customer can NO LONGER add/remove items
// (enforced in Session 6).

export const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending: ['waiting_vendor', 'cancelled'],
  waiting_vendor: ['preparing', 'cancelled'],
  preparing: ['picked_up', 'cancelled'],
  picked_up: ['delivered'],
  delivered: [], // terminal
  cancelled: [], // terminal
};

export function isTransitionAllowed(fromStatus: string, toStatus: string): boolean {
  const allowed = ALLOWED_TRANSITIONS[fromStatus];
  if (!allowed) return false;
  return allowed.includes(toStatus);
}

// Statuses after which the order is "locked" — no more item edits allowed.
// Anything strictly before `picked_up` (i.e. pending, waiting_vendor, preparing)
// is still editable.
export const EDITABLE_STATUSES = ['pending', 'waiting_vendor', 'preparing'];
export function isOrderEditable(status: string): boolean {
  return EDITABLE_STATUSES.includes(status);
}

export const updateOrderStatusSchema = z.strictObject({
  status: z.enum(['pending', 'waiting_vendor', 'preparing', 'picked_up', 'delivered', 'cancelled']),
  // Optional note for the audit log (e.g. 'Vendor confirmed', 'Customer cancelled')
  note: z.string().trim().max(500).optional(),
});

export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;

// ─── Pending list query (GET /orders/pending) ─────────────────
// Specialized endpoint for the operator's most-used view.
//
// Filters to "in-flight" orders only — status IN (pending, waiting_vendor, preparing).
// Excludes picked_up/delivered/cancelled because those don't need operator attention.
//
// Adds `minutesSinceCreated` (integer) for the UI to display "5 min ago" badges.

export const listPendingOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  // Search by customer name OR phone (partial, case-insensitive)
  customer: z.string().trim().optional(),
});

export type ListPendingOrdersQuery = z.infer<typeof listPendingOrdersQuerySchema>;

export interface PendingOrderListItem {
  id: number;
  orderCode: string;
  userId: number;
  customerName: string;
  customerPhone: string;
  status: string;
  total: string;
  itemsCount: number;
  createdAt: Date;
  minutesSinceCreated: number; // computed: floor((now - createdAt) / 60s)
}

export interface PaginatedPendingOrders {
  data: PendingOrderListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ─── Cancel order (DELETE /orders/:id) ────────────────────────
// Soft-delete — sets status to 'cancelled' and inserts a status_log row.
// Order is NEVER physically deleted (preserves audit trail for historical reports).
//
// Body is optional — may include a `note` explaining why the order was cancelled
// (e.g. 'Customer changed mind', 'Duplicate order', 'Out of stock').

export const cancelOrderSchema = z
  .object({
    note: z.string().trim().max(500).optional(),
  })
  .optional()
  .default({});

export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;

// ─── Vendor groups (GET /orders/:id/vendor-groups) ────────────
// Returns the order's items grouped by vendor, each with a pre-formatted
// multi-line `copyText` (paste-ready for WhatsApp) and a `whatsappUrl`
// (opens WhatsApp Web/app with text pre-filled).
//
// Used by the operator workflow:
//   1. Open order modal → see items grouped by vendor
//   2. Click "Copy" on a vendor block → `copyText` goes to clipboard
//   3. Click "WhatsApp" on a vendor block → `whatsappUrl` opens WhatsApp
//   4. Paste/click Send → vendor receives the itemized list
//
// Items marked `addedAfterFinalize=true` get a `*NEW*` prefix in the copyText
// so vendors can identify which items were added after the original order.

export interface VendorGroupItem {
  id: number;
  productNameSnapshot: string;
  priceSnapshot: string;
  qty: number;
  unit: string;
  lineTotal: string;
  addedAfterFinalize: boolean;
}

export interface VendorGroup {
  vendorId: number;
  vendorName: string;
  vendorPhone: string;
  vendorWhatsappNumber: string | null;
  items: VendorGroupItem[];
  subtotal: string;
  // Pre-formatted multi-line text — paste-ready for WhatsApp
  copyText: string;
  // https://wa.me/<number>?text=<urlencoded copyText>
  // NULL if vendor has no whatsappNumber
  whatsappUrl: string | null;
}

export interface OrderVendorGroups {
  orderCode: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string | null;
  groups: VendorGroup[];
}

// ─── Update order (PATCH /orders/:id) ─────────────────────────
// Inline-edit customer info while the order is in an editable state
// (pending, waiting_vendor, preparing).
//
// At least one field must be provided. Empty body → 400.
// `deliveryFee` changes trigger a total recompute (total = subtotal + deliveryFee).
//
// Once the order is picked_up/delivered/cancelled, this endpoint returns 409.

export const updateOrderSchema = z
  .object({
    customerName: z.string().trim().min(2).max(200).optional(),
    customerPhone: z
      .string()
      .trim()
      .regex(bangladeshiPhoneRegex, 'Customer phone must be a valid Bangladeshi number')
      .optional(),
    customerAddress: z.string().trim().max(500).nullable().optional(),
    deliveryFee: z.number().min(0).max(99999999.99).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;

// ─── Add item to pending order (POST /orders/:id/items) ───────
//
// Customer calls back after the order was finalized but BEFORE pickup →
// operator can add an item. The new item is marked `addedAfterFinalize=true`
// so it shows up with a *NEW* badge in the WhatsApp copy text.
//
// Editable window: status IN (pending, waiting_vendor, preparing)
// Once picked_up → 409 "Order is locked"

export const addOrderItemSchema = z.strictObject({
  productId: z.number().int().positive('productId must be a positive integer'),
  qty: z.number().int().positive('qty must be at least 1').max(9999),
});

export type AddOrderItemInput = z.infer<typeof addOrderItemSchema>;

// ─── Audit log (GET /orders/:id/audit-log) ────────────────────
// Returns the append-only status_log entries for an order, newest-first.
// Used by:
//   - The dashboard's "time per step" metric (compute diffs between adjacent
//     `changed_at` timestamps)
//   - Operators who want to see the full history of an order (transitions,
//     item additions, item removals, cancellations)
//
// Each row's `note` field carries a human-readable description:
//   - Status transitions: optional operator note (e.g. "Vendor confirmed")
//   - Item additions: 'added_item:<productId> (qty=N)'
//   - Item removals: 'removed_item:<itemId> (was: <name> qty=N)'
//   - Cancellations: optional reason (e.g. "Customer changed mind")

export interface AuditLogEntry {
  id: number;
  orderId: number;
  fromStatus: string | null; // null for the very first entry (order creation)
  toStatus: string;
  changedById: number;
  changedByName: string; // denormalized for display convenience
  note: string | null;
  changedAt: Date;
}

export interface OrderAuditLog {
  orderCode: string;
  entries: AuditLogEntry[];
}

// ─── Done list query (GET /orders/done) ───────────────────────
// Returns only delivered orders, sorted by deliveredAt DESC (newest delivery first).
// Optional month filter: ?month=2026-08 (ISO year-month).
//
// This is the "archive" view — operators use it to look up past deliveries
// for customer follow-up or to send the rating link.

export const listDoneOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  // ISO year-month: '2026-08'. Filters by deliveredAt in that month.
  month: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format (e.g. 2026-08)')
    .optional(),
  // Search by customer name or phone (same as listOrders)
  search: z.string().trim().optional(),
});

export type ListDoneOrdersQuery = z.infer<typeof listDoneOrdersQuerySchema>;

export interface DoneOrderListItem {
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

export interface PaginatedDoneOrders {
  data: DoneOrderListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ─── Rating link (POST /orders/:id/rating-link) ────────────────
// Generates a unique, single-use token for the customer rating form.
// The token is stored on the order row and used in the public URL:
//   https://yourapp.com/rate/<token>
//
// Idempotent: if a token already exists, returns the existing URL.
// Once the rating is submitted (Session 8.2), the token is cleared to NULL.

export interface RatingLinkResult {
  orderCode: string;
  ratingToken: string;
  url: string;
}
