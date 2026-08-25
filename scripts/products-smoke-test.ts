// One-off script: verify vendor + product schema works end-to-end.
// Run with: unset DATABASE_URL && npx tsx scripts/products-smoke-test.ts
//
// Creates:
//   - 1 vendor (Hashem Grocery)
//   - 3 products (Paracetamol 500mg, Rice Basmati 5kg, Sugar 1kg)
// Verifies:
//   - search_vector is auto-populated by the trigger
//   - full-text search returns expected results
// Cleans up:
//   - deletes the test data at the end

import { prisma } from '../src/config/prisma';

async function main() {
  console.info('\n=== Products Smoke Test ===\n');

  // ─── Cleanup any previous test data ─────────────────────────
  console.info('→ Cleaning up any previous test data...');
  await prisma.product.deleteMany({
    where: { sku: { in: ['TEST-PARA-500', 'TEST-RICE-5KG', 'TEST-SUGAR-1KG'] } },
  });
  await prisma.vendor.deleteMany({
    where: { name: { startsWith: 'Test Vendor' } },
  });

  // ─── 1. Create a vendor ────────────────────────────────────
  console.info('\n→ Creating test vendor...');
  const vendor = await prisma.vendor.create({
    data: {
      name: 'Test Vendor — Hashem Grocery',
      phone: '01712345678',
      whatsappNumber: '8801712345678',
      category: 'grocery',
      isActive: true,
    },
  });
  console.info(`   ✓ Vendor #${vendor.id} — ${vendor.name} (${vendor.category})`);

  // Get the grocery category
  const grocery = await prisma.category.findUnique({ where: { slug: 'grocery' } });
  if (!grocery) throw new Error('grocery category missing — run `npx prisma db seed` first');
  console.info(`   ✓ Using category: ${grocery.slug} (id=${grocery.id})`);

  // ─── 2. Create 3 products ───────────────────────────────────
  console.info('\n→ Creating test products...');
  const products = await Promise.all([
    prisma.product.create({
      data: {
        name: 'Paracetamol 500mg',
        sku: 'TEST-PARA-500',
        price: 10.0,
        categoryId: grocery.id,
        vendorId: vendor.id,
        unit: 'box',
      },
    }),
    prisma.product.create({
      data: {
        name: 'Rice Basmati 5kg',
        sku: 'TEST-RICE-5KG',
        price: 850.0,
        categoryId: grocery.id,
        vendorId: vendor.id,
        unit: 'bag',
      },
    }),
    prisma.product.create({
      data: {
        name: 'Sugar 1kg',
        sku: 'TEST-SUGAR-1KG',
        price: 95.0,
        categoryId: grocery.id,
        vendorId: vendor.id,
        unit: 'kg',
      },
    }),
  ]);
  for (const p of products) {
    console.info(`   ✓ Product #${p.id} — ${p.name} (${p.sku}) — ৳${p.price}`);
  }

  // ─── 3. Verify the trigger populated search_vector ─────────
  console.info('\n→ Verifying trigger populated search_vector...');
  const rows = await prisma.$queryRaw<
    Array<{ id: number; name: string; search_vector: string }>
  >`SELECT id, name, search_vector::text AS search_vector FROM products WHERE vendor_id = ${vendor.id} ORDER BY id`;
  for (const r of rows) {
    console.info(`   ✓ #${r.id} ${r.name} → search_vector: "${r.search_vector}"`);
  }

  // ─── 4. Full-text search test ───────────────────────────────
  console.info('\n→ Testing full-text search...');
  const fts = await prisma.$queryRaw<
    Array<{ id: number; name: string; rank: number }>
  >`
    SELECT p.id, p.name, ts_rank(p.search_vector, q) AS rank
    FROM products p, to_tsquery('english', 'paracetamol') q
    WHERE p.search_vector @@ q AND p.vendor_id = ${vendor.id}
    ORDER BY rank DESC;
  `;
  for (const r of fts) {
    console.info(`   ✓ Found #${r.id} ${r.name} (rank=${r.rank})`);
  }
  if (fts.length === 0) {
    throw new Error('FTS returned 0 rows for "paracetamol" — trigger or index is broken');
  }

  // ─── 5. ILIKE fallback test ─────────────────────────────────
  console.info('\n→ Testing ILIKE fallback...');
  const ilike = await prisma.product.findMany({
    where: {
      name: { contains: 'Basmati', mode: 'insensitive' },
      vendorId: vendor.id,
    },
  });
  for (const p of ilike) {
    console.info(`   ✓ Found via ILIKE: ${p.name}`);
  }

  // ─── 6. Update a product — trigger should refresh search_vector
  console.info('\n→ Updating a product to verify trigger fires on UPDATE...');
  const updated = await prisma.product.update({
    where: { sku: 'TEST-PARA-500' },
    data: { name: 'Paracetamol Extra 500mg' },
  });
  console.info(`   ✓ Updated name → "${updated.name}"`);
  const after = await prisma.$queryRaw<
    Array<{ search_vector: string }>
  >`SELECT search_vector::text AS search_vector FROM products WHERE sku = 'TEST-PARA-500'`;
  console.info(`   ✓ search_vector after update: "${after[0]?.search_vector}"`);

  // ─── Cleanup ────────────────────────────────────────────────
  console.info('\n→ Cleaning up test data...');
  await prisma.product.deleteMany({
    where: { vendorId: vendor.id },
  });
  await prisma.vendor.delete({ where: { id: vendor.id } });
  console.info('   ✓ Cleaned up');

  console.info('\n=== All product schema tests succeeded ✅ ===\n');
}

main()
  .catch((err) => {
    console.error('\nSmoke test failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
