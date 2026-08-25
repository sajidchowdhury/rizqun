import { type Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/AppError';
import type { CreateProductInput, UpdateProductInput, ListProductsQuery } from './products.dto';

// ─── Public product shape (includes category + vendor for convenience) ──

export interface PublicProduct {
  id: number;
  name: string;
  sku: string | null;
  price: string; // Decimal is serialized as string by Prisma
  categoryId: number;
  vendorId: number;
  unit: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  category?: { id: number; slug: string; name: string };
  vendor?: { id: number; name: string; phone: string; whatsappNumber: string | null };
}

function toPublicProduct(p: {
  id: number;
  name: string;
  sku: string | null;
  price: Prisma.Decimal;
  categoryId: number;
  vendorId: number;
  unit: string;
  isActive: boolean;
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
    price: p.price.toString(),
    categoryId: p.categoryId,
    vendorId: p.vendorId,
    unit: p.unit,
    isActive: p.isActive,
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
