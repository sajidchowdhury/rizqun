import bcrypt from 'bcryptjs';
import { type Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/AppError';
import type { CreateUserInput, UpdateUserInput, ListUsersQuery, PublicUser } from './users.dto';

const BCRYPT_COST = 12;

// ─── Helpers ───────────────────────────────────────────────────

function toPublicUser(user: {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: string;
  categoryAccess: unknown;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): PublicUser {
  const access = Array.isArray(user.categoryAccess) ? (user.categoryAccess as string[]) : [];
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    categoryAccess: access,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

// Validate categoryAccess against known slugs + 'all'
async function validateCategoryAccess(access: string[]): Promise<void> {
  const validSlugs = await prisma.category.findMany({ select: { slug: true } });
  const validSet = new Set<string>([...validSlugs.map((c) => c.slug), 'all']);
  const invalid = access.filter((s) => !validSet.has(s));
  if (invalid.length) {
    throw new AppError(400, `Invalid category slugs: ${invalid.join(', ')}`);
  }
}

// ─── List ──────────────────────────────────────────────────────

export interface PaginatedUsers {
  data: PublicUser[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function listUsers(query: ListUsersQuery): Promise<PaginatedUsers> {
  const where: Prisma.UserWhereInput = {};

  if (query.role) {
    where.role = query.role;
  }

  if (query.isActive !== undefined) {
    where.isActive = query.isActive;
  }

  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { email: { contains: query.search, mode: 'insensitive' } },
      { phone: { contains: query.search } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    data: rows.map(toPublicUser),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

// ─── Create ───────────────────────────────────────────────────

export async function createUser(input: CreateUserInput): Promise<PublicUser> {
  // Email uniqueness
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new AppError(409, 'Email already registered');
  }

  // Validate categoryAccess
  await validateCategoryAccess(input.categoryAccess);

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      phone: input.phone,
      passwordHash,
      role: input.role,
      categoryAccess: input.categoryAccess,
    },
  });

  return toPublicUser(user);
}

// ─── Update ────────────────────────────────────────────────────

export async function updateUser(
  id: number,
  input: UpdateUserInput,
  callerId: number,
): Promise<PublicUser> {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError(404, 'User not found');
  }

  // Email uniqueness (if changing)
  if (input.email && input.email !== existing.email) {
    const conflict = await prisma.user.findUnique({ where: { email: input.email } });
    if (conflict) {
      throw new AppError(409, 'Email already registered');
    }
  }

  // Validate categoryAccess (if changing)
  if (input.categoryAccess !== undefined) {
    await validateCategoryAccess(input.categoryAccess);
  }

  // Prevent self-deactivation (super admin can't deactivate themselves)
  if (input.isActive === false && id === callerId) {
    throw new AppError(409, 'Cannot deactivate your own account');
  }

  // Prevent self-role-downgrade (super admin can't demote themselves)
  if (input.role && input.role !== 'super_admin' && id === callerId) {
    throw new AppError(409, 'Cannot change your own role from super_admin');
  }

  // Hash password if changing
  let passwordHash: string | undefined;
  if (input.password) {
    passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.email !== undefined && { email: input.email }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(passwordHash !== undefined && { passwordHash }),
      ...(input.role !== undefined && { role: input.role }),
      ...(input.categoryAccess !== undefined && { categoryAccess: input.categoryAccess }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
  });

  return toPublicUser(updated);
}

// ─── Soft delete ──────────────────────────────────────────────

export async function deleteUser(
  id: number,
  callerId: number,
): Promise<{ id: number; isActive: boolean }> {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError(404, 'User not found');
  }

  if (!existing.isActive) {
    throw new AppError(409, 'User is already deactivated');
  }

  // Prevent self-deactivation
  if (id === callerId) {
    throw new AppError(409, 'Cannot deactivate your own account');
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { isActive: false },
    select: { id: true, isActive: true },
  });

  return updated;
}
