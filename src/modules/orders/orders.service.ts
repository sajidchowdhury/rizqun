import { Prisma, type OrderStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/AppError';
import { generateUniqueOrderCode } from '../../utils/orderCode';
import type {
  FinalizeOrderInput,
  PublicOrder,
  PublicOrderItem,
  ListOrdersQuery,
  PaginatedOrders,
  OrderListItem,
} from './orders.dto';

// ─── Helpers ───────────────────────────────────────────────────

function toPublicOrderItem(item: {
  id: number;
  productId: number | null;
  vendorId: number;
  productNameSnapshot: string;
  priceSnapshot: Prisma.Decimal;
  qty: number;
  lineTotal: Prisma.Decimal;
  addedAfterFinalize: boolean;
  addedAt: Date;
  vendor?: { id: number; name: string; phone: string; whatsappNumber: string | null } | null;
}): PublicOrderItem {
  return {
    id: item.id,
    productId: item.productId,
    vendorId: item.vendorId,
    productNameSnapshot: item.productNameSnapshot,
    priceSnapshot: item.priceSnapshot.toString(),
    qty: item.qty,
    lineTotal: item.lineTotal.toString(),
    addedAfterFinalize: item.addedAfterFinalize,
    addedAt: item.addedAt,
    ...(item.vendor && { vendor: item.vendor }),
  };
}

function toPublicOrder(order: {
  id: number;
  orderCode: string;
  userId: number;
  customerName: string;
  customerPhone: string;
  customerAddress: string | null;
  subtotal: Prisma.Decimal;
  deliveryFee: Prisma.Decimal;
  total: Prisma.Decimal;
  status: OrderStatus;
  ratingToken: string | null;
  createdAt: Date;
  deliveredAt: Date | null;
  items: Array<{
    id: number;
    productId: number | null;
    vendorId: number;
    productNameSnapshot: string;
    priceSnapshot: Prisma.Decimal;
    qty: number;
    lineTotal: Prisma.Decimal;
    addedAfterFinalize: boolean;
    addedAt: Date;
    vendor?: { id: number; name: string; phone: string; whatsappNumber: string | null } | null;
  }>;
}): PublicOrder {
  return {
    id: order.id,
    orderCode: order.orderCode,
    userId: order.userId,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    customerAddress: order.customerAddress,
    subtotal: order.subtotal.toString(),
    deliveryFee: order.deliveryFee.toString(),
    total: order.total.toString(),
    status: order.status,
    ratingToken: order.ratingToken,
    createdAt: order.createdAt,
    deliveredAt: order.deliveredAt,
    items: order.items.map(toPublicOrderItem),
  };
}

// ─── Finalize order ────────────────────────────────────────────
//
// This is the "click Finalize" action — converts the active cart (frontend state)
// into a saved Order + OrderItems + the initial StatusLog entry.
//
// Validation performed:
//   1. Each productId must exist + be active
//   2. Each product's category must be in the user's categoryAccess
//      (so a grocery-only operator cannot finalize an order containing a medicine product)
//   3. Each product's vendor must still be active
//
// We do all reads first, then a single transaction for the writes.

interface FinalizeContext {
  userId: number;
  userCategoryAccess: string[];
}

export async function finalizeOrder(
  input: FinalizeOrderInput,
  ctx: FinalizeContext,
): Promise<PublicOrder> {
  const hasAll = ctx.userCategoryAccess.includes('all');

  // ─── 1. Fetch all referenced products in one query ──────────
  const productIds = input.items.map((i) => i.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    include: {
      category: { select: { slug: true, name: true } },
      vendor: {
        select: { id: true, name: true, phone: true, whatsappNumber: true, isActive: true },
      },
    },
  });

  // Build a lookup map for fast access
  const productMap = new Map(products.map((p) => [p.id, p]));

  // ─── 2. Validate every item ────────────────────────────────
  // Collect errors so we can return ALL of them at once (better UX than one-by-one)
  const errors: string[] = [];

  for (const [i, item] of input.items.entries()) {
    const product = productMap.get(item.productId);

    if (!product) {
      errors.push(`Item ${i + 1}: product with id ${item.productId} does not exist`);
      continue;
    }

    if (!product.isActive) {
      errors.push(`Item ${i + 1}: product "${product.name}" is no longer active`);
      continue;
    }

    if (!product.vendor?.isActive) {
      errors.push(`Item ${i + 1}: vendor for "${product.name}" is deactivated`);
      continue;
    }

    if (!hasAll && !ctx.userCategoryAccess.includes(product.category.slug)) {
      errors.push(
        `Item ${i + 1}: you do not have access to the '${product.category.slug}' category (product: ${product.name})`,
      );
    }
  }

  if (errors.length > 0) {
    throw new AppError(400, `Order validation failed: ${errors.join('; ')}`);
  }

  // ─── 3. Compute totals ──────────────────────────────────────
  // We already validated that all products exist + are active, so we can safely
  // access them via productMap. Defensive `.filter(Boolean)` keeps TS happy without
  // a non-null assertion.
  const lineItems = input.items
    .map((item) => {
      const product = productMap.get(item.productId);
      if (!product) return null; // unreachable — validation above already rejected
      const lineTotal = product.price.mul(item.qty);
      return {
        productId: product.id,
        vendorId: product.vendorId,
        productNameSnapshot: product.name,
        priceSnapshot: product.price,
        qty: item.qty,
        lineTotal,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const subtotal = lineItems.reduce((sum, item) => sum.plus(item.lineTotal), new Prisma.Decimal(0));
  const total = subtotal.plus(input.deliveryFee);

  // ─── 4. Generate the orderCode BEFORE entering the transaction ──
  // (Generating inside the transaction would hold a lock while we wait for the count query.)
  const orderCode = await generateUniqueOrderCode();

  // ─── 5. Transaction: create Order + OrderItems + StatusLog ──
  const order = await prisma.$transaction(async (tx) => {
    // Create the order
    const newOrder = await tx.order.create({
      data: {
        orderCode,
        userId: ctx.userId,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        customerAddress: input.customerAddress ?? null,
        subtotal,
        deliveryFee: input.deliveryFee,
        total,
        status: 'pending',
      },
    });

    // Create all order items in one batch
    await tx.orderItem.createMany({
      data: lineItems.map((item) => ({
        orderId: newOrder.id,
        productId: item.productId,
        vendorId: item.vendorId,
        productNameSnapshot: item.productNameSnapshot,
        priceSnapshot: item.priceSnapshot,
        qty: item.qty,
        lineTotal: item.lineTotal,
        addedAfterFinalize: false, // initial items are not "added after finalize"
      })),
    });

    // Insert the first status_log row (NULL → pending)
    await tx.statusLog.create({
      data: {
        orderId: newOrder.id,
        fromStatus: null,
        toStatus: 'pending',
        changedBy: ctx.userId,
        note: 'Order created',
      },
    });

    // Fetch the order back with items + vendor info for the response
    return tx.order.findUnique({
      where: { id: newOrder.id },
      include: {
        items: {
          include: {
            vendor: {
              select: { id: true, name: true, phone: true, whatsappNumber: true },
            },
          },
          orderBy: { id: 'asc' },
        },
      },
    });
  });

  if (!order) {
    // Should be impossible — we just created the order in the transaction
    throw new AppError(500, 'Failed to create order');
  }

  return toPublicOrder(order);
}

// ─── List orders ────────────────────────────────────────────────
//
// Scoping rules:
//   - super_admin → sees all orders
//   - regular user → sees only their own orders
//
// This is enforced by the `where.userId` clause based on the caller's role.

interface ListContext {
  userId: number;
  role: string;
}

export async function listOrders(
  query: ListOrdersQuery,
  ctx: ListContext,
): Promise<PaginatedOrders> {
  const where: Prisma.OrderWhereInput = {};

  // Scope by role — operators see only their own orders
  if (ctx.role !== 'super_admin') {
    where.userId = ctx.userId;
  }

  if (query.status) {
    where.status = query.status;
  }

  if (query.from || query.to) {
    where.createdAt = {};
    if (query.from) where.createdAt.gte = new Date(query.from);
    if (query.to) where.createdAt.lt = new Date(query.to);
  }

  if (query.search) {
    where.OR = [
      { customerName: { contains: query.search, mode: 'insensitive' } },
      { customerPhone: { contains: query.search } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      // We don't load items here — just the count, for the list view
      // (loading all items for every list row would be wasteful)
      select: {
        id: true,
        orderCode: true,
        userId: true,
        customerName: true,
        customerPhone: true,
        status: true,
        total: true,
        createdAt: true,
        deliveredAt: true,
        _count: { select: { items: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);

  const data: OrderListItem[] = rows.map((r) => ({
    id: r.id,
    orderCode: r.orderCode,
    userId: r.userId,
    customerName: r.customerName,
    customerPhone: r.customerPhone,
    status: r.status,
    total: r.total.toString(),
    itemsCount: r._count.items,
    createdAt: r.createdAt,
    deliveredAt: r.deliveredAt,
  }));

  return {
    data,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

// ─── Get one order ─────────────────────────────────────────────

export async function getOrderById(id: number, ctx: ListContext): Promise<PublicOrder> {
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          vendor: {
            select: { id: true, name: true, phone: true, whatsappNumber: true },
          },
        },
        orderBy: { id: 'asc' },
      },
    },
  });

  if (!order) {
    throw new AppError(404, 'Order not found');
  }

  // Scope check: non-super_admin users can only see their own orders
  if (ctx.role !== 'super_admin' && order.userId !== ctx.userId) {
    // Return 404 (not 403) to avoid leaking that the order exists
    throw new AppError(404, 'Order not found');
  }

  return toPublicOrder(order);
}
