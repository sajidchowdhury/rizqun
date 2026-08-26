// Production seed script — run ONCE on a fresh production database.
// Run with: unset DATABASE_URL && npx tsx scripts/seed-production.ts
//
// Seeds:
//   1. 3 categories (grocery, medicine, other)
//   2. 1 super admin with a STRONG password (from env)
//   3. 2 sample operators (one grocery-only, one all-access)
//   4. 3 sample vendors (one per category)
//   5. 5 sample products (spread across vendors + categories)
//
// This is the LAST step before go-live. After seeding, verify with the
// end-to-end smoke test (scripts/test-e2e.sh).

import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const BCRYPT_COST = 12;

async function main() {
  console.info('\n🌱 Production Seed\n');

  // ─── 1. Categories ──────────────────────────────────────────
  console.info('→ Seeding categories...');
  const categories = await Promise.all([
    prisma.category.upsert({
      where: { slug: 'grocery' },
      create: { slug: 'grocery', name: 'Grocery' },
      update: { name: 'Grocery' },
    }),
    prisma.category.upsert({
      where: { slug: 'medicine' },
      create: { slug: 'medicine', name: 'Medicine' },
      update: { name: 'Medicine' },
    }),
    prisma.category.upsert({
      where: { slug: 'other' },
      create: { slug: 'other', name: 'Other' },
      update: { name: 'Other' },
    }),
  ]);
  const [grocery, medicine, other] = categories;
  console.info(`   ✓ ${categories.length} categories seeded`);

  // ─── 2. Super Admin ─────────────────────────────────────────
  console.info('\n→ Seeding super admin...');
  const adminEmail = process.env.SUPER_ADMIN_EMAIL ?? 'admin@rizqun.com';
  const adminPassword = process.env.SUPER_ADMIN_PASSWORD ?? '';
  if (!adminPassword || adminPassword.length < 8) {
    throw new Error('SUPER_ADMIN_PASSWORD must be set in .env and be at least 8 characters');
  }
  const adminHash = await bcrypt.hash(adminPassword, BCRYPT_COST);
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    create: {
      name: 'Super Admin',
      email: adminEmail,
      phone: '+880000000000',
      passwordHash: adminHash,
      role: UserRole.super_admin,
      categoryAccess: ['all'],
      isActive: true,
    },
    update: {
      role: UserRole.super_admin,
      categoryAccess: ['all'],
      isActive: true,
      // Don't overwrite password — admin may have changed it
    },
  });
  console.info(`   ✓ ${admin.email} (super_admin, ['all'])`);

  // ─── 3. Sample Operators ────────────────────────────────────
  console.info('\n→ Seeding sample operators...');
  const op1Hash = await bcrypt.hash('Operator123!', BCRYPT_COST);
  const op2Hash = await bcrypt.hash('Operator456!', BCRYPT_COST);

  const op1 = await prisma.user.upsert({
    where: { email: 'grocery.op@rizqun.com' },
    create: {
      name: 'Grocery Operator',
      email: 'grocery.op@rizqun.com',
      phone: '01711111111',
      passwordHash: op1Hash,
      role: UserRole.user,
      categoryAccess: ['grocery'],
      isActive: true,
    },
    update: {},
  });

  const op2 = await prisma.user.upsert({
    where: { email: 'all.op@rizqun.com' },
    create: {
      name: 'All Access Operator',
      email: 'all.op@rizqun.com',
      phone: '01722222222',
      passwordHash: op2Hash,
      role: UserRole.user,
      categoryAccess: ['all'],
      isActive: true,
    },
    update: {},
  });
  console.info(`   ✓ ${op1.email} (user, ['grocery'])`);
  console.info(`   ✓ ${op2.email} (user, ['all'])`);

  // ─── 4. Sample Vendors ──────────────────────────────────────
  console.info('\n→ Seeding sample vendors...');
  // Use findFirst + create pattern since `phone` is not a unique field
  const vendorData = [
    { name: 'Hashem Grocery Store', phone: '01712345678', whatsappNumber: '8801712345678', category: 'grocery' as const },
    { name: 'City Pharma', phone: '01987654321', whatsappNumber: '8801987654321', category: 'medicine' as const },
    { name: 'General Supplies', phone: '01512345678', category: 'other' as const },
  ];

  const vendors = [];
  for (const vd of vendorData) {
    let vendor = await prisma.vendor.findFirst({ where: { phone: vd.phone } });
    if (!vendor) {
      vendor = await prisma.vendor.create({ data: vd });
    }
    vendors.push(vendor);
  }
  const [vGrocery, vMedicine, vOther] = vendors;
  console.info(`   ✓ ${vendors.length} vendors seeded`);

  // ─── 5. Sample Products ─────────────────────────────────────
  console.info('\n→ Seeding sample products...');
  const products = [
    { name: 'Rice Basmati 5kg', sku: 'GRO-RICE-5KG', price: 850, categoryId: grocery.id, vendorId: vGrocery.id, unit: 'bag' },
    { name: 'Sugar 1kg', sku: 'GRO-SUGAR-1KG', price: 95, categoryId: grocery.id, vendorId: vGrocery.id, unit: 'kg' },
    { name: 'Paracetamol 500mg (Box)', sku: 'MED-PARA-500', price: 120, categoryId: medicine.id, vendorId: vMedicine.id, unit: 'box' },
    { name: 'Amoxicillin 250mg', sku: 'MED-AMOX-250', price: 350, categoryId: medicine.id, vendorId: vMedicine.id, unit: 'box' },
    { name: 'Bottled Water 1L', sku: 'OTH-WATER-1L', price: 20, categoryId: other.id, vendorId: vOther.id, unit: 'pcs' },
  ];

  for (const p of products) {
    const existing = await prisma.product.findUnique({ where: { sku: p.sku } });
    if (!existing) {
      await prisma.product.create({ data: p });
      console.info(`   ✓ ${p.name} (${p.sku})`);
    } else {
      console.info(`   ⊝ ${p.name} (${p.sku}) — already exists`);
    }
  }

  // ─── Summary ────────────────────────────────────────────────
  const catCount = await prisma.category.count();
  const userCount = await prisma.user.count();
  const vendorCount = await prisma.vendor.count();
  const productCount = await prisma.product.count();

  console.info('\n📊 Production Seed Summary:');
  console.info(`   Categories: ${catCount}`);
  console.info(`   Users:      ${userCount} (1 admin + 2 operators)`);
  console.info(`   Vendors:    ${vendorCount}`);
  console.info(`   Products:   ${productCount}`);
  console.info('\n✅ Production seed complete.\n');
  console.info('Next steps:');
  console.info('  1. Run the E2E smoke test: bash scripts/test-e2e.sh');
  console.info('  2. Import real vendor + product data via CSV (scripts/import-products.ts)');
  console.info('  3. Change operator passwords before go-live!');
}

main()
  .catch((err) => {
    console.error('\n❌ Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
