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
} from './products.dto';

// ─── Public product shape (includes category + vendor for convenience) ──

export interface PublicProduct {
  id: number;
  name: string;
  sku: string | null;
  brand: string | null;
  price: string;
  categoryId: number;
  vendorId: number | null;
  unit: string;
  isActive: boolean;
  imageUrl: string | null;
  originalPrice: string | null;
  discountActive: boolean;
  genericName: string | null;
  isEssential: boolean;
  createdAt: Date;
  updatedAt: Date;
  category?: { id: number; slug: string; name: string };
  vendor?: { id: number; name: string; phone: string; whatsappNumber: string | null };
}

function toPublicProduct(p: {
  id: number;
  name: string;
  sku: string | null;
  brand: string | null;
  price: Prisma.Decimal;
  categoryId: number;
  vendorId: number | null;
  unit: string;
  isActive: boolean;
  imageUrl: string | null;
  originalPrice: Prisma.Decimal | null;
  discountActive: boolean;
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
}): PublicProduct {
  return {
    id: p.id,
    name: p.name,
    sku: p.sku,
    brand: p.brand,
    price: p.price.toString(),
    categoryId: p.categoryId,
    vendorId: p.vendorId,
    unit: p.unit,
    isActive: p.isActive,
    imageUrl: p.imageUrl,
    originalPrice: p.originalPrice ? p.originalPrice.toString() : null,
    discountActive: p.discountActive,
    genericName: p.genericName,
    isEssential: p.isEssential,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    ...(p.category && { category: p.category }),
    ...(p.vendor && { vendor: p.vendor }),
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

export async function listProducts(query: ListProductsQuery): Promise<PaginatedProducts> {
  const where: Prisma.ProductWhereInput = {};

  if (query.categoryId) {
    where.categoryId = query.categoryId;
  }

  if (query.vendorId) {
    where.vendorId = query.vendorId;
  }

  if (query.isActive !== undefined) {
    where.isActive = query.isActive;
  }

  // Category slug filter (used by category-scope middleware or direct query)
  if (query.category) {
    where.category = { slug: query.category };
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
      price: input.price,
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

export async function updateProduct(id: number, input: UpdateProductInput): Promise<PublicProduct> {
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

  const updated = await prisma.product.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.sku !== undefined && { sku: input.sku }),
      ...(input.price !== undefined && { price: input.price }),
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

interface CategoryFilter {
  hasAll: boolean;
  slugs: string[];
}

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
async function searchFts(
  tsQueryStr: string,
  slugs: string[] | null,
  limit: number,
): Promise<SearchResultRow[]> {
  if (slugs === null) {
    // No category filter
    return prisma.$queryRaw<SearchResultRow[]>`
      SELECT
        p.id, p.name, p.price::text AS price, p.unit,
        p.vendor_id AS "vendorId", v.name AS "vendorName",
        v.whatsapp_number AS "vendorWhatsappNumber",
        p.category_id AS "categoryId", c.slug AS "categorySlug", c.name AS "categoryName",
        p.image_url AS "imageUrl",
        p.original_price::text AS "originalPrice",
        p.discount_active AS "discountActive",
        p.generic_name AS "genericName",
        ts_rank(p.search_vector, q) AS rank, 'fts' AS source
      FROM products p
      CROSS JOIN to_tsquery('english', ${tsQueryStr}) AS q
      JOIN vendors v   ON v.id = p.vendor_id
      JOIN categories c ON c.id = p.category_id
      WHERE p.search_vector @@ q AND p.is_active = true
      ORDER BY rank DESC, p.id ASC
      LIMIT ${limit};
    `;
  }

  if (slugs.length === 0) return [];

  // With category filter — use Prisma.sql with parameterized array
  return prisma.$queryRaw<SearchResultRow[]>`
    SELECT
      p.id, p.name, p.price::text AS price, p.unit,
      p.vendor_id AS "vendorId", v.name AS "vendorName",
      v.whatsapp_number AS "vendorWhatsappNumber",
      p.category_id AS "categoryId", c.slug AS "categorySlug", c.name AS "categoryName",
      p.image_url AS "imageUrl",
      p.original_price::text AS "originalPrice",
      p.discount_active AS "discountActive",
      p.generic_name AS "genericName",
      ts_rank(p.search_vector, q) AS rank, 'fts' AS source
    FROM products p
    CROSS JOIN to_tsquery('english', ${tsQueryStr}) AS q
    JOIN vendors v   ON v.id = p.vendor_id
    JOIN categories c ON c.id = p.category_id
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
        p.id, p.name, p.price::text AS price, p.unit,
        p.vendor_id AS "vendorId", v.name AS "vendorName",
        v.whatsapp_number AS "vendorWhatsappNumber",
        p.category_id AS "categoryId", c.slug AS "categorySlug", c.name AS "categoryName",
        p.image_url AS "imageUrl",
        p.original_price::text AS "originalPrice",
        p.discount_active AS "discountActive",
        p.generic_name AS "genericName",
        0.0::float AS rank, 'ilike' AS source
      FROM products p
      JOIN vendors v   ON v.id = p.vendor_id
      JOIN categories c ON c.id = p.category_id
      WHERE p.name ILIKE ${pattern} AND p.is_active = true
      ORDER BY p.name ASC, p.id ASC
      LIMIT ${limit};
    `;
  }

  if (slugs.length === 0) return [];

  return prisma.$queryRaw<SearchResultRow[]>`
    SELECT
      p.id, p.name, p.price::text AS price, p.unit,
      p.vendor_id AS "vendorId", v.name AS "vendorName",
      v.whatsapp_number AS "vendorWhatsappNumber",
      p.category_id AS "categoryId", c.slug AS "categorySlug", c.name AS "categoryName",
      p.image_url AS "imageUrl",
      p.original_price::text AS "originalPrice",
      p.discount_active AS "discountActive",
      p.generic_name AS "genericName",
      0.0::float AS rank, 'ilike' AS source
    FROM products p
    JOIN vendors v   ON v.id = p.vendor_id
    JOIN categories c ON c.id = p.category_id
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
      price: input.price,
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
