import { type Prisma, type VendorCategory } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/AppError';
import type { CreateVendorInput, UpdateVendorInput, ListVendorsQuery } from './vendors.dto';

// ─── Public vendor shape (no internal fields leaked) ────────────

export interface PublicVendor {
  id: number;
  name: string;
  phone: string;
  whatsappNumber: string | null;
  category: VendorCategory;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toPublicVendor(v: {
  id: number;
  name: string;
  phone: string;
  whatsappNumber: string | null;
  category: VendorCategory;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): PublicVendor {
  return {
    id: v.id,
    name: v.name,
    phone: v.phone,
    whatsappNumber: v.whatsappNumber,
    category: v.category,
    isActive: v.isActive,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
  };
}

// ─── List ────────────────────────────────────────────────────────

export interface PaginatedVendors {
  data: PublicVendor[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function listVendors(query: ListVendorsQuery): Promise<PaginatedVendors> {
  const where: Prisma.VendorWhereInput = {};

  if (query.category) {
    where.category = query.category;
  }

  if (query.isActive !== undefined) {
    where.isActive = query.isActive;
  }

  if (query.search) {
    where.name = { contains: query.search, mode: 'insensitive' };
  }

  const [rows, total] = await Promise.all([
    prisma.vendor.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.vendor.count({ where }),
  ]);

  return {
    data: rows.map(toPublicVendor),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

// ─── Get one ────────────────────────────────────────────────────

export async function getVendorById(id: number): Promise<PublicVendor> {
  const vendor = await prisma.vendor.findUnique({ where: { id } });
  if (!vendor) {
    throw new AppError(404, 'Vendor not found');
  }
  return toPublicVendor(vendor);
}

// ─── Create ─────────────────────────────────────────────────────

export async function createVendor(input: CreateVendorInput): Promise<PublicVendor> {
  // Uniqueness check on phone — two vendors should not share a phone
  const existing = await prisma.vendor.findFirst({
    where: { phone: input.phone },
  });
  if (existing) {
    throw new AppError(409, 'A vendor with this phone number already exists');
  }

  const vendor = await prisma.vendor.create({
    data: {
      name: input.name,
      phone: input.phone,
      whatsappNumber: input.whatsappNumber ?? null,
      category: input.category,
      isActive: input.isActive,
    },
  });

  return toPublicVendor(vendor);
}

// ─── Update ─────────────────────────────────────────────────────

export async function updateVendor(id: number, input: UpdateVendorInput): Promise<PublicVendor> {
  const existing = await prisma.vendor.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError(404, 'Vendor not found');
  }

  // If phone is changing, check uniqueness against other vendors
  if (input.phone && input.phone !== existing.phone) {
    const conflict = await prisma.vendor.findFirst({
      where: { phone: input.phone, NOT: { id } },
    });
    if (conflict) {
      throw new AppError(409, 'A vendor with this phone number already exists');
    }
  }

  const updated = await prisma.vendor.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.whatsappNumber !== undefined && { whatsappNumber: input.whatsappNumber }),
      ...(input.category !== undefined && { category: input.category }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
  });

  return toPublicVendor(updated);
}

// ─── Soft delete ────────────────────────────────────────────────

export async function deleteVendor(id: number): Promise<{ id: number; isActive: boolean }> {
  const existing = await prisma.vendor.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError(404, 'Vendor not found');
  }

  if (!existing.isActive) {
    throw new AppError(409, 'Vendor is already deactivated');
  }

  // Block soft-delete if the vendor has any active products — we don't want to
  // orphan products that operators can still search and add to carts.
  const activeProductCount = await prisma.product.count({
    where: { vendorId: id, isActive: true },
  });
  if (activeProductCount > 0) {
    throw new AppError(
      409,
      `Cannot deactivate vendor: ${activeProductCount} active product(s) still reference this vendor. Deactivate or reassign them first.`,
    );
  }

  const updated = await prisma.vendor.update({
    where: { id },
    data: { isActive: false },
    select: { id: true, isActive: true },
  });

  return updated;
}
