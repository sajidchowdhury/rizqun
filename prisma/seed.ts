// prisma/seed.ts
// Run with: npx prisma db seed
//
// Seeds:
//   - 3 categories: grocery, medicine, other
//   - 1 super admin user (email + password from .env)

import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ─── Config (read from env, fall back to safe defaults) ─────────
const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL ?? 'admin@rizqun.com';
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD ?? 'ChangeMeInProduction123!';
const BCRYPT_COST = 12;

// ─── Seed data ──────────────────────────────────────────────────
const CATEGORIES = [
  { slug: 'grocery', name: 'Grocery' },
  { slug: 'medicine', name: 'Medicine' },
  { slug: 'other', name: 'Other' },
];

async function main() {
  console.info('\n🌱 Seeding Rizqun database...\n');

  // ─── 1. Categories (idempotent — upsert by slug) ─────────────
  console.info('→ Seeding categories...');
  for (const cat of CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      create: cat,
      update: { name: cat.name }, // update name in case it changed
    });
    console.info(`   ✓ ${cat.slug} — ${cat.name}`);
  }

  // ─── 2. Super admin (idempotent — upsert by email) ──────────
  console.info('\n→ Seeding super admin...');
  const passwordHash = await bcrypt.hash(SUPER_ADMIN_PASSWORD, BCRYPT_COST);

  const admin = await prisma.user.upsert({
    where: { email: SUPER_ADMIN_EMAIL },
    create: {
      name: 'Super Admin',
      email: SUPER_ADMIN_EMAIL,
      phone: '+880000000000', // placeholder — admin updates later
      passwordHash,
      role: UserRole.super_admin,
      categoryAccess: ['all'],
      isActive: true,
    },
    update: {
      // Don't overwrite password on every re-seed (admin may have changed it via UI).
      // Only update role + categoryAccess to ensure super admin always has full access.
      role: UserRole.super_admin,
      categoryAccess: ['all'],
      isActive: true,
    },
  });
  console.info(`   ✓ ${admin.email} (role: ${admin.role}, access: ${JSON.stringify(admin.categoryAccess)})`);

  // ─── Summary ────────────────────────────────────────────────
  const catCount = await prisma.category.count();
  const userCount = await prisma.user.count();
  console.info(`\n📊 Totals: ${catCount} categories, ${userCount} user(s)`);
  console.info('\n✅ Seed completed.\n');
}

main()
  .catch((err) => {
    console.error('\n❌ Seed failed:\n', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
