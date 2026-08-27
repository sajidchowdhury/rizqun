// prisma/seed.ts
// Run with: npx prisma db seed
//
// Seeds:
//   - 3 sections: Grocery, Medicine, Other
//   - 3 groups under Grocery: Cooking, Beverages, General
//   - 3 categories: Spices, Rice, Dairy (each under a group)
//   - 1 super admin user (email + password from .env)

import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL ?? 'admin@rizqun.com';
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD ?? 'ChangeMeInProduction123!';
const BCRYPT_COST = 12;

async function main() {
  console.info('\n🌱 Seeding Rizqun database...\n');

  // ─── 1. Sections ────────────────────────────────────────────
  console.info('→ Seeding sections...');
  const sections = [
    { slug: 'grocery', name: 'Grocery' },
    { slug: 'medicine', name: 'Medicine' },
    { slug: 'other', name: 'Other' },
  ];
  for (const s of sections) {
    await prisma.section.upsert({
      where: { slug: s.slug },
      create: s,
      update: { name: s.name },
    });
    console.info(`   ✓ Section: ${s.name}`);
  }
  const grocerySection = await prisma.section.findUnique({ where: { slug: 'grocery' } })!;

  // ─── 2. Groups (under Grocery section) ──────────────────────
  console.info('\n→ Seeding groups...');
  const groups = [
    { slug: 'cooking', name: 'Cooking', sectionId: grocerySection.id },
    { slug: 'beverages', name: 'Beverages', sectionId: grocerySection.id },
    { slug: 'general', name: 'General', sectionId: grocerySection.id },
  ];
  for (const g of groups) {
    await prisma.group.upsert({
      where: { slug: g.slug },
      create: g,
      update: { name: g.name, sectionId: g.sectionId },
    });
    console.info(`   ✓ Group: ${g.name}`);
  }
  const cookingGroup = await prisma.group.findUnique({ where: { slug: 'cooking' } })!;

  // ─── 3. Categories (under Cooking group) ───────────────────
  console.info('\n→ Seeding categories...');
  const categories = [
    { slug: 'spices', name: 'Spices', groupId: cookingGroup.id },
    { slug: 'rice', name: 'Rice', groupId: cookingGroup.id },
    { slug: 'oil', name: 'Oil', groupId: cookingGroup.id },
  ];
  for (const c of categories) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      create: c,
      update: { name: c.name, groupId: c.groupId },
    });
    console.info(`   ✓ Category: ${c.name}`);
  }

  // ─── 4. Super admin ────────────────────────────────────────
  console.info('\n→ Seeding super admin...');
  const passwordHash = await bcrypt.hash(SUPER_ADMIN_PASSWORD, BCRYPT_COST);
  const admin = await prisma.user.upsert({
    where: { email: SUPER_ADMIN_EMAIL },
    create: {
      name: 'Super Admin',
      email: SUPER_ADMIN_EMAIL,
      phone: '+880000000000',
      passwordHash,
      role: UserRole.super_admin,
      categoryAccess: ['all'],
      isActive: true,
    },
    update: {
      role: UserRole.super_admin,
      categoryAccess: ['all'],
      isActive: true,
    },
  });
  console.info(`   ✓ ${admin.email} (role: ${admin.role})`);

  // ─── Summary ────────────────────────────────────────────────
  const sectionCount = await prisma.section.count();
  const groupCount = await prisma.group.count();
  const catCount = await prisma.category.count();
  const userCount = await prisma.user.count();
  console.info(`\n📊 Totals: ${sectionCount} sections, ${groupCount} groups, ${catCount} categories, ${userCount} user(s)`);
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
