/** Order types — mirrors backend's PublicOrder + finalizeOrderSchema. */

export type OrderStatus =
  'pending' | 'waiting_vendor' | 'preparing' | 'picked_up' | 'delivered' | 'cancelled';

export interface PublicOrderItem {
  id: number;
  productId: number | null;
  vendorId: number;
  productNameSnapshot: string;
  priceSnapshot: string;
  qty: number;
  lineTotal: string;
  addedAfterFinalize: boolean;
  addedAt: string;
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
  status: OrderStatus;
  ratingToken: string | null;
  createdAt: string;
  deliveredAt: string | null;
  items: PublicOrderItem[];
}

// ─── Finalize payload (sent to POST /orders) ───────────────────

export interface FinalizeOrderPayload {
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  deliveryFee: number;
  items: Array<{ productId: number; qty: number }>;
}

// ─── Response shapes ───────────────────────────────────────────

export interface OrderResponse {
  order: PublicOrder;
}

// ─── Pending list (GET /orders/pending) ────────────────────────

export interface PendingOrderListItem {
  id: number;
  orderCode: string;
  customerName: string;
  customerPhone: string;
  status: OrderStatus;
  total: string;
  createdAt: string;
  minutesSinceCreated: number;
  itemsCount: number;
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

// ─── Vendor groups (GET /orders/:id/vendor-groups) ─────────────

export interface VendorGroupItemAlternative {
  vendorId: number;
  vendorName: string;
  purchasePrice: string;
  /** Per-unit margin if we switched to this vendor = priceSnapshot - purchasePrice. */
  margin: string;
  isPreferred: boolean;
}

export interface VendorGroupItem {
  id: number;
  productNameSnapshot: string;
  priceSnapshot: string;
  /** Phase 4 (2026-08-28): purchase price at order time (for margin calc). */
  purchasePriceSnapshot: string;
  /** Why this vendor was chosen: "auto" / "manual" / "only-vendor" / "default-vendor" / "preferred". */
  vendorChoiceReason: string | null;
  qty: number;
  unit: string;
  lineTotal: string;
  addedAfterFinalize: boolean;
  /** Per-unit margin = priceSnapshot - purchasePriceSnapshot. */
  margin: string;
  /** Total margin for this line = margin × qty. */
  lineMargin: string;
  /** Other vendors that could supply this product (with their margins). */
  alternatives: VendorGroupItemAlternative[];
}

export interface VendorGroup {
  vendorId: number;
  vendorName: string;
  vendorPhone: string;
  vendorWhatsappNumber: string | null;
  items: VendorGroupItem[];
  subtotal: string;
  /** Phase 4 (2026-08-28): total margin for this vendor group. */
  totalMargin: string;
  /** True if any item was auto-selected or preferred (shows "Recommended" badge). */
  isRecommended: boolean;
  copyText: string;
  whatsappUrl: string | null;
}

export interface OrderVendorGroups {
  orderCode: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string | null;
  groups: VendorGroup[];
}

// ─── Audit log (GET /orders/:id/audit-log) ─────────────────────

export interface AuditLogEntry {
  id: number;
  fromStatus: string | null;
  toStatus: string;
  changedBy: number;
  changedByName?: string;
  note: string | null;
  changedAt: string;
}

export interface AuditLog {
  entries: AuditLogEntry[];
}

// ─── Done list (GET /orders/done) ──────────────────────────────

export interface OrderRating {
  overall: number;
  speed: number;
  behavior: number;
  comment: string | null;
  submittedAt: string;
}

export interface DoneOrderListItem {
  id: number;
  orderCode: string;
  userId: number;
  customerName: string;
  customerPhone: string;
  status: string;
  total: string;
  itemsCount: number;
  createdAt: string;
  deliveredAt: string | null;
  rating: OrderRating | null;
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
