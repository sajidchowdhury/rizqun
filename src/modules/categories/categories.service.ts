import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/AppError';
import type { CreateCategoryInput, UpdateCategoryInput, PublicCategory } from './categories.dto';

function toPublicCategory(c: {
  id: number;
  slug: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}): PublicCategory {
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

// ─── List ──────────────────────────────────────────────────────

export async function listCategories(): Promise<PublicCategory[]> {
  const categories = await prisma.category.findMany({
    orderBy: { id: 'asc' },
  });
  return categories.map(toPublicCategory);
}

// ─── Create ────────────────────────────────────────────────────

export async function createCategory(input: CreateCategoryInput): Promise<PublicCategory> {
  const existing = await prisma.category.findUnique({ where: { slug: input.slug } });
  if (existing) {
    throw new AppError(409, `Category with slug '${input.slug}' already exists`);
  }

  const category = await prisma.category.create({
    data: {
      slug: input.slug,
      name: input.name,
    },
  });

  return toPublicCategory(category);
}

// ─── Update ────────────────────────────────────────────────────

export async function updateCategory(
  id: number,
  input: UpdateCategoryInput,
): Promise<PublicCategory> {
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError(404, 'Category not found');
  }

  // Slug uniqueness (if changing)
  if (input.slug && input.slug !== existing.slug) {
    const conflict = await prisma.category.findUnique({ where: { slug: input.slug } });
    if (conflict) {
      throw new AppError(409, `Category with slug '${input.slug}' already exists`);
    }
  }

  const updated = await prisma.category.update({
    where: { id },
    data: {
      ...(input.slug !== undefined && { slug: input.slug }),
      ...(input.name !== undefined && { name: input.name }),
    },
  });

  return toPublicCategory(updated);
}

// ─── Delete ────────────────────────────────────────────────────
//
// Blocked if any products reference this category (onDelete: Restrict on the
// FK prevents cascading). We check proactively so we can return a helpful
// error message instead of a raw DB constraint violation.

export async function deleteCategory(id: number): Promise<{ id: number }> {
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError(404, 'Category not found');
  }

  const productCount = await prisma.product.count({
    where: { categoryId: id },
  });

  if (productCount > 0) {
    throw new AppError(
      409,
      `Cannot delete category: ${productCount} product(s) still reference this category. Reassign or delete them first.`,
    );
  }

  await prisma.category.delete({ where: { id } });
  return { id };
}
