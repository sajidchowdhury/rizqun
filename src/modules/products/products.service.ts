import { type Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/AppError';
import type {
  CreateProductInput,
  UpdateProductInput,
  ListProductsQuery,
  SearchProductsQuery,
  SearchResultRow,
  QuickAddProductInput,
  BulkUpdatePricesInput,
  SetVendorPriceInput,
  PriceHistoryQuery,
} from './products.dto';

// ─── Public product shape (includes category + vendor for convenience) ──
//
// All three prices are exposed. `effectivePrice` is the price the customer
// actually pays — discountPrice if set, otherwise salePrice. The order UI
// uses `effectivePrice` for display + cart math; the products list page
// shows all 3 raw prices so the operator can audit margins.

// CategoryFilter — shared between listProducts + searchProducts. Set by
// the `categoryScope` middleware from the user's `categoryAccess`. Lives
// here (top of file) so both functions can reference it.
interface CategoryFilter {
  hasAll: boolean;
  slugs: string[];
}

export interface PublicProduct {
  id: number;
  name: string;
  sku: string | null;
  brand: string | null;
  // ─── 3 prices (Phase 1, 2026-08-28) ─────────────────────────
  purchasePrice: string;
  salePrice: string;
  discountPrice: string | null;
  // Convenience: what the customer actually pays right now
  effectivePrice: string;
  categoryId: number;
  vendorId: number | null;
  unit: string;
  isActive: boolean;
  imageUrl: string | null;
  genericName: string | null;
  isEssential: boolean;
  createdAt: Date;
  updatedAt: Date;
  category?: { id: number; slug: string; name: string };
  vendor?: { id: number; name: string; phone: string; whatsappNumber: string | null };
  // Per-vendor purchase prices, if loaded. Undefined on list views where
  // we don't fetch the join (to keep the payload small).
  productVendors?: Array<{
    vendorId: number;
    vendorName: string;
    purchasePrice: string;
    isPreferred: boolean;
  }>;
}

function toPublicProduct(p: {
  id: number;
  name: string;
  sku: string | null;
  brand: string | null;
  purchasePrice: Prisma.Decimal;
  salePrice: Prisma.Decimal;
  discountPrice: Prisma.Decimal | null;
  categoryId: number;
  vendorId: number | null;
  unit: string;
  isActive: boolean;
  imageUrl: string | null;
  genericName: string | null;
  isEssential: boolean;
  createdAt: Date;
  updatedAt: Date;
  category?: { id: number; slug: string; name: string } | null;
  vendor?: {
    id: number;
    name: string;
    phone: string;
    whatsappNumber: string | null;
  } | null;
  productVendors?: Array<{
    vendorId: number;
    purchasePrice: Prisma.Decimal;
    isPreferred: boolean;
    vendor: { name: string };
  }>;
}): PublicProduct {
  const effective = p.discountPrice ?? p.salePrice;
  return {
    id: p.id,
    name: p.name,
    sku: p.sku,
    brand: p.brand,
    purchasePrice: p.purchasePrice.toString(),
    salePrice: p.salePrice.toString(),
    discountPrice: p.discountPrice ? p.discountPrice.toString() : null,
    effectivePrice: effective.toString(),
    categoryId: p.categoryId,
    vendorId: p.vendorId,
    unit: p.unit,
    isActive: p.isActive,
    imageUrl: p.imageUrl,
    genericName: p.genericName,
    isEssential: p.isEssential,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    ...(p.category && { category: p.category }),
    ...(p.vendor && { vendor: p.vendor }),
    ...(p.productVendors && {
      productVendors: p.productVendors.map((pv) => ({
        vendorId: pv.vendorId,
        vendorName: pv.vendor.name,
        purchasePrice: pv.purchasePrice.toString(),
        isPreferred: pv.isPreferred,
      })),
    }),
  };
}

// ─── List ────────────────────────────────────────────────────────

export interface PaginatedProducts {
  data: PublicProduct[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function listProducts(
  query: ListProductsQuery,
  categoryFilter?: CategoryFilter,
): Promise<PaginatedProducts> {
  const where: Prisma.ProductWhereInput = {};

  // ─── Category scope (per-user categoryAccess) ───────────────
  // If the user has 'all' access, no filter is applied. Otherwise,
  // restrict products to those whose category slug is in the user's
  // allowed list. This is the same logic used by `searchProducts`.
  if (categoryFilter && !categoryFilter.hasAll) {
    if (categoryFilter.slugs.length === 0) {
      // User has no access to any category → return no products
      return {
        data: [],
        pagination: { page: query.page, limit: query.limit, total: 0, totalPages: 0 },
      };
    }
    where.category = { slug: { in: categoryFilter.slugs } };
  }

  if (query.categoryId) {
    where.categoryId = query.categoryId;
  }

  if (query.vendorId) {
    where.vendorId = query.vendorId;
  }

  if (query.isActive !== undefined) {
    where.isActive = query.isActive;
  }

  // Category slug filter (explicit `?category=` query param —
  // intersected with the user's categoryAccess above)
  if (query.category) {
    where.category = where.category
      ? { AND: [where.category, { slug: query.category }] }
      : { slug: query.category };
  }

  // ILIKE search on name (full-text search endpoint comes in Session 2.4)
  if (query.search) {
    where.name = { contains: query.search, mode: 'insensitive' };
  }

  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: {
        category: { select: { id: true, slug: true, name: true } },
        vendor: {
          select: { id: true, name: true, phone: true, whatsappNumber: true },
        },
      },
    }),
    prisma.product.count({ where }),
  ]);

  return {
    data: rows.map(toPublicProduct),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

// ─── Get one ────────────────────────────────────────────────────

export async function getProductById(id: number): Promise<PublicProduct> {
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, slug: true, name: true } },
      vendor: {
        select: { id: true, name: true, phone: true, whatsappNumber: true },
      },
    },
  });
  if (!product) {
    throw new AppError(404, 'Product not found');
  }
  return toPublicProduct(product);
}

// ─── Create ─────────────────────────────────────────────────────

export async function createProduct(input: CreateProductInput): Promise<PublicProduct> {
  // Validate category exists
  const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
  if (!category) {
    throw new AppError(400, `Category with id ${input.categoryId} does not exist`);
  }

  // Validate vendor exists + is active
  const vendor = await prisma.vendor.findUnique({ where: { id: input.vendorId } });
  if (!vendor) {
    throw new AppError(400, `Vendor with id ${input.vendorId} does not exist`);
  }
  if (!vendor.isActive) {
    throw new AppError(400, `Vendor with id ${input.vendorId} is deactivated`);
  }

  // SKU uniqueness check (if provided)
  if (input.sku) {
    const existing = await prisma.product.findUnique({ where: { sku: input.sku } });
    if (existing) {
      throw new AppError(409, `A product with SKU '${input.sku}' already exists`);
    }
  }

  const product = await prisma.product.create({
    data: {
      name: input.name,
      sku: input.sku ?? null,
      purchasePrice: input.purchasePrice,
      salePrice: input.salePrice,
      discountPrice: input.discountPrice ?? null,
      categoryId: input.categoryId,
      vendorId: input.vendorId,
      unit: input.unit,
      isActive: input.isActive,
    },
    include: {
      category: { select: { id: true, slug: true, name: true } },
      vendor: {
        select: { id: true, name: true, phone: true, whatsappNumber: true },
      },
    },
  });

  return toPublicProduct(product);
}

// ─── Update ─────────────────────────────────────────────────────
//
// If any price field (purchasePrice, salePrice, discountPrice) is changed,
// a ProductPriceHistory row is appended with the new snapshot. This keeps
// the audit trail intact for the morning vendor-call workflow AND for
// individual product edits from the admin panel.

export async function updateProduct(
  id: number,
  input: UpdateProductInput,
  ctx?: { userId: number },
): Promise<PublicProduct> {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError(404, 'Product not found');
  }

  // Validate category if changing
  if (input.categoryId && input.categoryId !== existing.categoryId) {
    const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
    if (!category) {
      throw new AppError(400, `Category with id ${input.categoryId} does not exist`);
    }
  }

  // Validate vendor if changing
  if (input.vendorId && input.vendorId !== existing.vendorId) {
    const vendor = await prisma.vendor.findUnique({ where: { id: input.vendorId } });
    if (!vendor) {
      throw new AppError(400, `Vendor with id ${input.vendorId} does not exist`);
    }
    if (!vendor.isActive) {
      throw new AppError(400, `Vendor with id ${input.vendorId} is deactivated`);
    }
  }

  // SKU uniqueness check (if changing)
  if (input.sku && input.sku !== existing.sku) {
    const conflict = await prisma.product.findFirst({
      where: { sku: input.sku, NOT: { id } },
    });
    if (conflict) {
      throw new AppError(409, `A product with SKU '${input.sku}' already exists`);
    }
  }

  // ─── Detect price changes so we can log history ────────────
  // We log a history row if ANY of the 3 prices actually changed
  // (not just submitted — the new value must differ from the existing one).
  const priceChanged =
    (input.purchasePrice !== undefined &&
      input.purchasePrice !== Number(existing.purchasePrice)) ||
    (input.salePrice !== undefined && input.salePrice !== Number(existing.salePrice)) ||
    (input.discountPrice !== undefined &&
      ((input.discountPrice === null && existing.discountPrice !== null) ||
        (input.discountPrice !== null &&
          (existing.discountPrice === null ||
            input.discountPrice !== Number(existing.discountPrice)))));

  const updated = await prisma.$transaction(async (tx) => {
    const product = await tx.product.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.sku !== undefined && { sku: input.sku }),
        ...(input.purchasePrice !== undefined && { purchasePrice: input.purchasePrice }),
        ...(input.salePrice !== undefined && { salePrice: input.salePrice }),
        ...(input.discountPrice !== undefined && { discountPrice: input.discountPrice }),
        ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
        ...(input.vendorId !== undefined && { vendorId: input.vendorId }),
        ...(input.unit !== undefined && { unit: input.unit }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
      include: {
        category: { select: { id: true, slug: true, name: true } },
        vendor: {
          select: { id: true, name: true, phone: true, whatsappNumber: true },
        },
      },
    });

    // ─── Append price history row if any price changed ────
    if (priceChanged && ctx?.userId) {
      await tx.productPriceHistory.create({
        data: {
          productId: id,
          // vendorId is null here — this is a product-level change
          // (salePrice / discountPrice / default purchasePrice).
          // Per-vendor purchase-price changes go through
          // `bulkUpdatePrices` or `setVendorPrice`, which set vendorId.
          vendorId: null,
          purchasePrice: product.purchasePrice,
          salePrice: product.salePrice,
          discountPrice: product.discountPrice,
          changedBy: ctx.userId,
          note: 'Product edit',
        },
      });
    }

    return product;
  });

  return toPublicProduct(updated);
}

// ─── Soft delete ───────────────────────────────────────────────

export async function deleteProduct(id: number): Promise<{ id: number; isActive: boolean }> {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError(404, 'Product not found');
  }

  if (!existing.isActive) {
    throw new AppError(409, 'Product is already deactivated');
  }

  // Note: we don't block soft-delete based on order_items here because historical
  // orders snapshot product name + price, so deactivating a product doesn't
  // break them. We may add a stricter check in Session 6 if mid-pending edits
  // need it.

  const updated = await prisma.product.update({
    where: { id },
    data: { isActive: false },
    select: { id: true, isActive: true },
  });

  return updated;
}

// ─── Smart search (FTS + ILIKE fallback) ────────────────────────
//
// Strategy:
//   1. Run a full-text search query using tsquery + ts_rank + the GIN index.
//      This is fast (sub-100ms even at 35K rows) and ranks by relevance.
//   2. If FTS returns fewer than 5 rows, run an ILIKE '%q%' fallback and merge.
//      This catches misspellings or partial matches that FTS misses.
//   3. Category scoping is enforced by intersecting with the user's
//      `categoryFilter.slugs` (set by the `categoryScope` middleware).
//      Super admins / users with ['all'] get no filter.

// Number of FTS results below which we run the ILIKE fallback.
const FTS_FALLBACK_THRESHOLD = 5;

/**
 * Convert a user-typed query string into a Postgres tsquery.
 *
 * Examples:
 *   "paracetamol"      → "paracetamol"
 *   "paracet 500"       → "paracet & 500"   (AND)
 *
 * We use plain plainto_tsquery which handles escaping safely and ANDs tokens.
 * For more advanced search (prefix matching, OR), we'd use to_tsquery with
 * manual parsing — but plainto_tsquery is good enough and safe.
 */
function buildTsQuery(q: string): string {
  // Strip characters that would confuse plainto_tsquery — it handles most
  // things gracefully, but we strip quotes/parens to be safe.
  return q.replace(/['"()\\]/g, ' ').trim();
}

/**
 * Compute the effective category slug filter for the current request.
 *
 * Returns:
 *   - null  → no filter (user has 'all' access and didn't specify a category)
 *   - string[] → filter to these slugs only (may be empty if user has no access)
 *
 * Rules:
 *   - If user has 'all' access and no explicit `?category=` → no filter (null)
 *   - If user has 'all' access and an explicit `?category=` → filter to that one slug
 *   - If user has specific slugs only → filter to those slugs
 *   - If user has specific slugs AND asks for an explicit category not in their list → empty (deny)
 */
function buildCategorySlugs(
  filter: CategoryFilter | undefined,
  extraCategory?: string,
): string[] | null {
  if (filter?.hasAll) {
    if (extraCategory) {
      return [extraCategory]; // narrow to the requested category
    }
    return null; // super admin sees everything
  }

  const userSlugs = filter?.slugs ?? [];
  if (extraCategory) {
    // Only allow if extraCategory is in the user's allowed list
    return userSlugs.includes(extraCategory) ? [extraCategory] : [];
  }
  return userSlugs;
}

export async function searchProducts(
  query: SearchProductsQuery,
  categoryFilter: CategoryFilter | undefined,
): Promise<{ data: SearchResultRow[]; source: 'fts' | 'merged' | 'ilike' }> {
  const tsQueryStr = buildTsQuery(query.q);
  const slugs = buildCategorySlugs(categoryFilter, query.category);

  const ftsResults = await searchFts(tsQueryStr, slugs, query.limit);

  // ─── ILIKE fallback (only if FTS returned few results) ─────
  if (ftsResults.length < FTS_FALLBACK_THRESHOLD) {
    const ilikeResults = await searchIlike(query.q, slugs, query.limit);
    const ftsIds = new Set(ftsResults.map((r) => r.id));
    const merged = [...ftsResults, ...ilikeResults.filter((r) => !ftsIds.has(r.id))].slice(
      0,
      query.limit,
    );

    const source = ftsResults.length === 0 ? 'ilike' : 'merged';
    return { data: merged, source };
  }

  return { data: ftsResults, source: 'fts' };
}

// ─── FTS implementation with proper parameter binding ─────────
//
// SELECT projection includes the 3 prices + `effectivePrice` (the price the
// customer actually pays — discountPrice if set, otherwise salePrice). The
// `effectivePrice` column is computed in SQL via COALESCE so the frontend
// doesn't have to re-derive it for every search hit.

async function searchFts(
  tsQueryStr: string,
  slugs: string[] | null,
  limit: number,
): Promise<SearchResultRow[]> {
  if (slugs === null) {
    // No category filter
    return prisma.$queryRaw<SearchResultRow[]>`
      SELECT
        p.id, p.name,
        p.sale_price::text     AS "salePrice",
        p.purchase_price::text AS "purchasePrice",
        p.discount_price::text AS "discountPrice",
        COALESCE(p.discount_price, p.sale_price)::text AS "effectivePrice",
        p.unit,
        p.vendor_id AS "vendorId", v.name AS "vendorName",
        v.whatsapp_number AS "vendorWhatsappNumber",
        p.category_id AS "categoryId", c.slug AS "categorySlug", c.name AS "categoryName",
        p.image_url AS "imageUrl",
        p.generic_name AS "genericName",
        ts_rank(p.search_vector, q) AS rank, 'fts' AS source
      FROM products p
      CROSS JOIN to_tsquery('english', ${tsQueryStr}) AS q
      LEFT JOIN vendors   v ON v.id = p.vendor_id
      JOIN  categories c ON c.id = p.category_id
      WHERE p.search_vector @@ q AND p.is_active = true
      ORDER BY rank DESC, p.id ASC
      LIMIT ${limit};
    `;
  }

  if (slugs.length === 0) return [];

  // With category filter — use Prisma.sql with parameterized array
  return prisma.$queryRaw<SearchResultRow[]>`
    SELECT
      p.id, p.name,
      p.sale_price::text     AS "salePrice",
      p.purchase_price::text AS "purchasePrice",
      p.discount_price::text AS "discountPrice",
      COALESCE(p.discount_price, p.sale_price)::text AS "effectivePrice",
      p.unit,
      p.vendor_id AS "vendorId", v.name AS "vendorName",
      v.whatsapp_number AS "vendorWhatsappNumber",
      p.category_id AS "categoryId", c.slug AS "categorySlug", c.name AS "categoryName",
      p.image_url AS "imageUrl",
      p.generic_name AS "genericName",
      ts_rank(p.search_vector, q) AS rank, 'fts' AS source
    FROM products p
    CROSS JOIN to_tsquery('english', ${tsQueryStr}) AS q
    LEFT JOIN vendors   v ON v.id = p.vendor_id
    JOIN  categories c ON c.id = p.category_id
    WHERE p.search_vector @@ q
      AND p.is_active = true
      AND c.slug = ANY(${slugs}::text[])
    ORDER BY rank DESC, p.id ASC
    LIMIT ${limit};
  `;
}

// ─── ILIKE fallback implementation ────────────────────────────
async function searchIlike(
  q: string,
  slugs: string[] | null,
  limit: number,
): Promise<SearchResultRow[]> {
  const pattern = `%${q}%`;

  if (slugs === null) {
    return prisma.$queryRaw<SearchResultRow[]>`
      SELECT
        p.id, p.name,
        p.sale_price::text     AS "salePrice",
        p.purchase_price::text AS "purchasePrice",
        p.discount_price::text AS "discountPrice",
        COALESCE(p.discount_price, p.sale_price)::text AS "effectivePrice",
        p.unit,
        p.vendor_id AS "vendorId", v.name AS "vendorName",
        v.whatsapp_number AS "vendorWhatsappNumber",
        p.category_id AS "categoryId", c.slug AS "categorySlug", c.name AS "categoryName",
        p.image_url AS "imageUrl",
        p.generic_name AS "genericName",
        0.0::float AS rank, 'ilike' AS source
      FROM products p
      LEFT JOIN vendors   v ON v.id = p.vendor_id
      JOIN  categories c ON c.id = p.category_id
      WHERE p.name ILIKE ${pattern} AND p.is_active = true
      ORDER BY p.name ASC, p.id ASC
      LIMIT ${limit};
    `;
  }

  if (slugs.length === 0) return [];

  return prisma.$queryRaw<SearchResultRow[]>`
    SELECT
      p.id, p.name,
      p.sale_price::text     AS "salePrice",
      p.purchase_price::text AS "purchasePrice",
      p.discount_price::text AS "discountPrice",
      COALESCE(p.discount_price, p.sale_price)::text AS "effectivePrice",
      p.unit,
      p.vendor_id AS "vendorId", v.name AS "vendorName",
      v.whatsapp_number AS "vendorWhatsappNumber",
      p.category_id AS "categoryId", c.slug AS "categorySlug", c.name AS "categoryName",
      p.image_url AS "imageUrl",
      p.generic_name AS "genericName",
      0.0::float AS rank, 'ilike' AS source
    FROM products p
    LEFT JOIN vendors   v ON v.id = p.vendor_id
    JOIN  categories c ON c.id = p.category_id
    WHERE p.name ILIKE ${pattern}
      AND p.is_active = true
      AND c.slug = ANY(${slugs}::text[])
    ORDER BY p.name ASC, p.id ASC
    LIMIT ${limit};
  `;
}

// ─── Quick-add (operator-side, in-call product creation) ────────
//
// Differences from `createProduct` (super-admin path):
//   1. Takes `categorySlug` instead of `categoryId` (operators don't know IDs)
//   2. Auto-generates SKU if not provided
//   3. Enforces user's `categoryAccess` — operators can only create products
//      in categories they have access to
//   4. Does not allow setting `isActive` (always true — operators don't deactivate)

export async function quickAddProduct(
  input: QuickAddProductInput,
  userId: number,
  userCategoryAccess: string[],
): Promise<PublicProduct> {
  // ─── 1. Verify the user has access to the requested category ──
  // Super admin has ['all'] → can create in any category
  const hasAll = userCategoryAccess.includes('all');
  if (!hasAll && !userCategoryAccess.includes(input.categorySlug)) {
    throw new AppError(403, `You do not have access to the '${input.categorySlug}' category`);
  }

  // ─── 2. Look up the category by slug ─────────────────────────
  const category = await prisma.category.findUnique({
    where: { slug: input.categorySlug },
  });
  if (!category) {
    throw new AppError(400, `Category '${input.categorySlug}' does not exist`);
  }

  // ─── 3. Validate vendor exists + is active ────────────────────
  const vendor = await prisma.vendor.findUnique({ where: { id: input.vendorId } });
  if (!vendor) {
    throw new AppError(400, `Vendor with id ${input.vendorId} does not exist`);
  }
  if (!vendor.isActive) {
    throw new AppError(400, `Vendor with id ${input.vendorId} is deactivated`);
  }

  // ─── 4. Auto-generate SKU if not provided ─────────────────────
  // Format: QUICK-{userId}-{YYYYMMDDHHmmss}
  // Collisions are unlikely (operator rarely quick-adds 2 products within the same second)
  // and the unique constraint will catch them anyway.
  let sku = input.sku;
  if (!sku) {
    const now = new Date();
    const ts =
      now.getUTCFullYear().toString() +
      String(now.getUTCMonth() + 1).padStart(2, '0') +
      String(now.getUTCDate()).padStart(2, '0') +
      String(now.getUTCHours()).padStart(2, '0') +
      String(now.getUTCMinutes()).padStart(2, '0') +
      String(now.getUTCSeconds()).padStart(2, '0');
    sku = `QUICK-${userId}-${ts}`;
  }

  // ─── 5. SKU uniqueness check ─────────────────────────────────
  const existing = await prisma.product.findUnique({ where: { sku } });
  if (existing) {
    throw new AppError(409, `A product with SKU '${sku}' already exists`);
  }

  // ─── 6. Create ────────────────────────────────────────────────
  const product = await prisma.product.create({
    data: {
      name: input.name,
      sku,
      purchasePrice: input.purchasePrice,
      salePrice: input.salePrice,
      discountPrice: input.discountPrice ?? null,
      categoryId: category.id,
      vendorId: input.vendorId,
      unit: input.unit,
      isActive: true, // always active on creation
    },
    include: {
      category: { select: { id: true, slug: true, name: true } },
      vendor: {
        select: { id: true, name: true, phone: true, whatsappNumber: true },
      },
    },
  });

  return toPublicProduct(product);
}

// ─── Frequently Bought Together recommendations ───────────────────
// Returns products that are commonly ordered alongside the given product.

export async function getProductRecommendations(
  productId: number,
  limit: number = 5,
): Promise<PublicProduct[]> {
  const coOccurring = await prisma.$queryRaw<Array<{ product_id: number; count: bigint }>>`
    SELECT oi2.product_id, COUNT(*)::bigint AS count
    FROM order_items oi1
    JOIN order_items oi2
      ON oi1.order_id = oi2.order_id
      AND oi2.product_id != oi1.product_id
    WHERE oi1.product_id = ${productId}
      AND oi2.product_id IS NOT NULL
    GROUP BY oi2.product_id
    ORDER BY count DESC
    LIMIT ${limit};
  `;

  if (coOccurring.length === 0) return [];

  const productIds = coOccurring.map((r) => r.product_id);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, isActive: true },
    include: {
      category: { select: { id: true, slug: true, name: true } },
      vendor: { select: { id: true, name: true, phone: true, whatsappNumber: true } },
    },
  });

  const countMap = new Map(coOccurring.map((r) => [r.product_id, Number(r.count)]));
  return products
    .sort((a, b) => (countMap.get(b.id) ?? 0) - (countMap.get(a.id) ?? 0))
    .map(toPublicProduct);
}

// ─── Essential products (for push-sale) ──────────────────────────

export async function getEssentialProducts(limit: number = 10): Promise<PublicProduct[]> {
  const products = await prisma.product.findMany({
    where: { isEssential: true, isActive: true },
    include: {
      category: { select: { id: true, slug: true, name: true } },
      vendor: { select: { id: true, name: true, phone: true, whatsappNumber: true } },
    },
    take: limit,
    orderBy: { name: 'asc' },
  });
  return products.map(toPublicProduct);
}

// ─── Bulk price update (the morning vendor-call workflow) ────────
//
// POST /products/bulk-update-prices
//
// Workflow:
//   1. Operator calls vendor in the morning, gets the day's prices.
//   2. Operator opens the price-update page, picks the vendor, edits the
//      prices for the products that changed (or all of them if needed).
//   3. On submit, the frontend calls this endpoint with a list of updates.
//   4. For each update:
//      - Write the new prices to the Product (salePrice, discountPrice)
//      - Write the new purchasePrice to the ProductVendor row for
//        (product, vendor), upserting if needed
//      - Append a ProductPriceHistory row with the new snapshot
//        (vendorId set, since this is a vendor-specific change)
//   5. All in a single transaction — partial failures roll back.
//
// Returns a summary: how many products were updated, how many history
// rows were written. The frontend shows this as a toast.

export interface BulkUpdateResult {
  updated: number;
  historyRows: number;
}

export async function bulkUpdatePrices(
  input: BulkUpdatePricesInput,
  ctx: { userId: number },
): Promise<BulkUpdateResult> {
  // ─── 1. Validate the vendor exists ──────────────────────────
  const vendor = await prisma.vendor.findUnique({ where: { id: input.vendorId } });
  if (!vendor) {
    throw new AppError(400, `Vendor with id ${input.vendorId} does not exist`);
  }

  // ─── 2. Fetch all referenced products in one query ──────────
  const productIds = input.updates.map((u) => u.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: {
      id: true,
      purchasePrice: true,
      salePrice: true,
      discountPrice: true,
      vendorId: true,
    },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  // Validate every product exists
  const missing = productIds.filter((id) => !productMap.has(id));
  if (missing.length > 0) {
    throw new AppError(400, `Products not found: ${missing.join(', ')}`);
  }

  // ─── 3. Run the update in a transaction ────────────────────
  let updated = 0;
  let historyRows = 0;

  await prisma.$transaction(async (tx) => {
    for (const u of input.updates) {
      const existing = productMap.get(u.productId);
      if (!existing) continue; // unreachable — validated above

      // Build the product update payload — only the fields that are
      // actually being changed (avoids touching `updatedAt` for fields
      // that didn't change).
      const productUpdate: Prisma.ProductUpdateInput = {};
      if (u.purchasePrice !== undefined) {
        productUpdate.purchasePrice = u.purchasePrice;
      }
      if (u.salePrice !== undefined) {
        productUpdate.salePrice = u.salePrice;
      }
      if (u.discountPrice !== undefined) {
        productUpdate.discountPrice = u.discountPrice;
      }

      // Determine if anything actually changed (avoid empty updates + no-op history rows)
      const productChanged =
        (u.purchasePrice !== undefined &&
          u.purchasePrice !== Number(existing.purchasePrice)) ||
        (u.salePrice !== undefined && u.salePrice !== Number(existing.salePrice)) ||
        (u.discountPrice !== undefined &&
          ((u.discountPrice === null && existing.discountPrice !== null) ||
            (u.discountPrice !== null &&
              (existing.discountPrice === null ||
                u.discountPrice !== Number(existing.discountPrice)))));

      if (Object.keys(productUpdate).length > 0 && productChanged) {
        await tx.product.update({
          where: { id: u.productId },
          data: productUpdate,
        });
        updated++;
      }

      // ─── Upsert ProductVendor row + per-vendor purchasePrice ──
      // We upsert even if the purchase price didn't change, because the
      // operator might be calling this vendor for the first time (so the
      // ProductVendor row doesn't exist yet). The unique constraint is
      // (productId, vendorId), so the upsert is safe.
      if (u.purchasePrice !== undefined) {
        await tx.productVendor.upsert({
          where: {
            productId_vendorId: { productId: u.productId, vendorId: input.vendorId },
          },
          update: { purchasePrice: u.purchasePrice },
          create: {
            productId: u.productId,
            vendorId: input.vendorId,
            purchasePrice: u.purchasePrice,
          },
        });
      }

      // ─── Append price history row ──────────────────────────
      // We log a history row only if something actually changed.
      if (productChanged || u.purchasePrice !== undefined) {
        // Re-read the product to get the post-update snapshot
        const after = await tx.product.findUnique({
          where: { id: u.productId },
          select: { purchasePrice: true, salePrice: true, discountPrice: true },
        });
        if (after) {
          await tx.productPriceHistory.create({
            data: {
              productId: u.productId,
              vendorId: input.vendorId, // vendor-specific change
              purchasePrice: after.purchasePrice,
              salePrice: after.salePrice,
              discountPrice: after.discountPrice,
              changedBy: ctx.userId,
              note: input.note ?? null,
            },
          });
          historyRows++;
        }
      }
    }
  });

  return { updated, historyRows };
}

// ─── Set per-vendor purchase price (single product, single vendor) ──
//
// POST /products/:id/vendor-price
//
// Used by Phase 4 prep — sets `ProductVendor.purchasePrice` for one
// (product, vendor) pair, upserting the row if needed. Also writes a
// ProductPriceHistory row.

export async function setVendorPrice(
  productId: number,
  input: SetVendorPriceInput,
  ctx: { userId: number },
): Promise<{ productVendor: { productId: number; vendorId: number; purchasePrice: string } }> {
  // Validate product exists
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) {
    throw new AppError(404, 'Product not found');
  }

  // Validate vendor exists
  const vendor = await prisma.vendor.findUnique({ where: { id: input.vendorId } });
  if (!vendor) {
    throw new AppError(400, `Vendor with id ${input.vendorId} does not exist`);
  }

  const result = await prisma.$transaction(async (tx) => {
    const pv = await tx.productVendor.upsert({
      where: {
        productId_vendorId: { productId, vendorId: input.vendorId },
      },
      update: {
        purchasePrice: input.purchasePrice,
        ...(input.isPreferred !== undefined && { isPreferred: input.isPreferred }),
      },
      create: {
        productId,
        vendorId: input.vendorId,
        purchasePrice: input.purchasePrice,
        isPreferred: input.isPreferred ?? false,
      },
      select: { productId: true, vendorId: true, purchasePrice: true },
    });

    // Append history row
    await tx.productPriceHistory.create({
      data: {
        productId,
        vendorId: input.vendorId,
        purchasePrice: product.purchasePrice, // product-level (unchanged here)
        salePrice: product.salePrice,
        discountPrice: product.discountPrice,
        changedBy: ctx.userId,
        note: 'Vendor price set',
      },
    });

    return pv;
  });

  return {
    productVendor: {
      productId: result.productId,
      vendorId: result.vendorId,
      purchasePrice: result.purchasePrice.toString(),
    },
  };
}

// ─── Price history (audit log query) ────────────────────────────
//
// GET /products/:id/price-history
//
// Returns the append-only log of every price change for a product.
// Filterable by vendorId (to see only this vendor's purchase-price
// changes) and date range.

export interface PriceHistoryRow {
  id: number;
  productId: number;
  vendorId: number | null;
  vendorName: string | null;
  purchasePrice: string;
  salePrice: string;
  discountPrice: string | null;
  effectivePrice: string;
  changedBy: number;
  changedByName: string;
  changedAt: Date;
  note: string | null;
}

export async function getPriceHistory(
  productId: number,
  query: PriceHistoryQuery,
): Promise<{ data: PriceHistoryRow[] }> {
  // Validate product exists
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) {
    throw new AppError(404, 'Product not found');
  }

  const where: Prisma.ProductPriceHistoryWhereInput = { productId };
  if (query.vendorId !== undefined) {
    where.vendorId = query.vendorId;
  }
  if (query.from || query.to) {
    where.changedAt = {};
    if (query.from) where.changedAt.gte = new Date(query.from);
    if (query.to) where.changedAt.lte = new Date(query.to);
  }

  const rows = await prisma.productPriceHistory.findMany({
    where,
    orderBy: { changedAt: 'desc' },
    take: query.limit,
    include: {
      vendor: { select: { name: true } },
      changer: { select: { name: true } },
    },
  });

  return {
    data: rows.map((r) => {
      const effective = r.discountPrice ?? r.salePrice;
      return {
        id: r.id,
        productId: r.productId,
        vendorId: r.vendorId,
        vendorName: r.vendor?.name ?? null,
        purchasePrice: r.purchasePrice.toString(),
        salePrice: r.salePrice.toString(),
        discountPrice: r.discountPrice ? r.discountPrice.toString() : null,
        effectivePrice: effective.toString(),
        changedBy: r.changedBy,
        changedByName: r.changer.name,
        changedAt: r.changedAt,
        note: r.note,
      };
    }),
  };
}

// ─── List products for a specific vendor (with per-vendor purchase price)
//
// GET /vendors/:id/products
//
// Used by the morning price-update UI. Returns the vendor's full catalog:
//   - Products where Product.vendorId = vendorId (default vendor)
//   - Products where there's a ProductVendor row (multi-vendor sourcing)
// De-duplicated by product id (a product can be in both sets).
//
// Each product includes:
//   - The vendor's per-vendor purchasePrice (from ProductVendor, or 0 if no row yet)
//   - The product's current salePrice, discountPrice (from Product)
//   - The product's default vendorId (for the "default vendor" badge in the UI)
//   - The default Product.purchasePrice (for reference, so the operator can
//     see whether the per-vendor price differs from the default)
//
// Optional filters:
//   - categoryId (filter by product category)
//   - search (search by product name)
//   - includeInactive (default false — usually we only show active products
//     in the price-update workflow, but admin may want to update prices on
//     inactive products too)

export interface VendorProductRow {
  id: number;
  name: string;
  brand: string | null;
  unit: string;
  imageUrl: string | null;
  categoryId: number;
  categoryName: string;
  // The vendor's current purchase price for this product
  // (from ProductVendor — 0 if no row exists yet)
  vendorPurchasePrice: string;
  // The product's default vendor (for the "default vendor" badge)
  isDefaultVendor: boolean;
  // Product-level prices (current values, displayed for reference)
  purchasePrice: string;
  salePrice: string;
  discountPrice: string | null;
  effectivePrice: string;
  isActive: boolean;
}

export interface ListVendorProductsQuery {
  categoryId?: number;
  search?: string;
  includeInactive?: boolean;
  limit?: number;
}

export async function listVendorProducts(
  vendorId: number,
  query: ListVendorProductsQuery = {},
  categoryFilter?: CategoryFilter,
): Promise<{ data: VendorProductRow[]; vendor: { id: number; name: string } }> {
  // Validate vendor exists
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: { id: true, name: true },
  });
  if (!vendor) {
    throw new AppError(404, 'Vendor not found');
  }

  // Build the where clause:
  //   - Products where Product.vendorId = vendorId (default vendor), OR
  //   - Products where there's a ProductVendor row with this vendorId
  // De-dup happens naturally because Prisma's OR returns unique rows.
  const where: Prisma.ProductWhereInput = {
    OR: [
      { vendorId },
      { productVendors: { some: { vendorId } } },
    ],
  };

  // ─── Category scope (per-user categoryAccess) ───────────────
  // Restrict products to the user's allowed categories so an operator
  // with grocery-only access can't see medicine products even when
  // picking a vendor that supplies both.
  if (categoryFilter && !categoryFilter.hasAll) {
    if (categoryFilter.slugs.length === 0) {
      return { data: [], vendor: { id: vendor.id, name: vendor.name } };
    }
    where.category = { slug: { in: categoryFilter.slugs } };
  }

  if (!query.includeInactive) {
    where.isActive = true;
  }
  if (query.categoryId) {
    where.categoryId = query.categoryId;
  }
  if (query.search) {
    where.name = { contains: query.search, mode: 'insensitive' };
  }

  const limit = Math.min(query.limit ?? 500, 1000);

  const products = await prisma.product.findMany({
    where,
    orderBy: { name: 'asc' },
    take: limit,
    include: {
      category: { select: { id: true, name: true } },
      // Filter ProductVendor to only this vendor — we don't care about other
      // vendors' prices here.
      productVendors: {
        where: { vendorId },
        select: { purchasePrice: true, isPreferred: true },
      },
    },
  });

  const rows: VendorProductRow[] = products.map((p) => {
    const pv = p.productVendors[0];
    const effective = p.discountPrice ?? p.salePrice;
    return {
      id: p.id,
      name: p.name,
      brand: p.brand,
      unit: p.unit,
      imageUrl: p.imageUrl,
      categoryId: p.categoryId,
      categoryName: p.category?.name ?? '—',
      vendorPurchasePrice: pv ? pv.purchasePrice.toString() : '0',
      isDefaultVendor: p.vendorId === vendorId,
      purchasePrice: p.purchasePrice.toString(),
      salePrice: p.salePrice.toString(),
      discountPrice: p.discountPrice ? p.discountPrice.toString() : null,
      effectivePrice: effective.toString(),
      isActive: p.isActive,
    };
  });

  return { data: rows, vendor };
}
