// One-off script: verify order schema + orderCode generation.
// Run with: unset DATABASE_URL && npx tsx scripts/orders-smoke-test.ts

import { prisma } from '../src/config/prisma';

async function main() {
  console.info('\n=== Orders Schema Smoke Test ===\n');

  // ─── Cleanup ──────────────────────────────────────────────
  await prisma.statusLog.deleteMany({});
  await prisma.rating.deleteMany({});
  await prisma.orderItem.deleteMany({});
  await prisma.order.deleteMany({});
  console.info('Cleaned up previous test data.');

  // ─── 1. Create an order with orderCode = ORD-2026-00001 ──
  console.info('\n→ Creating first order...');
  const year = new Date().getFullYear();
  const order1 = await prisma.order.create({
    data: {
      orderCode: `ORD-${year}-00001`,
      userId: 2, // seeded super admin
      customerName: 'Test Customer 1',
      customerPhone: '01711111111',
      customerAddress: 'Test Address',
      subtotal: 100.0,
      deliveryFee: 30.0,
      total: 130.0,
      status: 'pending',
    },
  });
  console.info(`   ✓ Order #${order1.id} - ${order1.orderCode} - ${order1.status}`);

  // ─── 2. Try to create an order with the same orderCode → unique violation ─
  console.info('\n→ Trying duplicate orderCode (expect unique violation)...');
  try {
    await prisma.order.create({
      data: {
        orderCode: `ORD-${year}-00001`, // duplicate
        userId: 2,
        customerName: 'Dup',
        customerPhone: '01722222222',
        subtotal: 0,
        deliveryFee: 0,
        total: 0,
      },
    });
    console.info('   ✗ FAILED: duplicate orderCode was allowed!');
    process.exit(1);
  } catch (err) {
    console.info('   ✓ Correctly rejected: unique constraint works');
  }

  // ─── 3. Create second order + add order items ───────────
  console.info('\n→ Creating second order with items...');
  const order2 = await prisma.order.create({
    data: {
      orderCode: `ORD-${year}-00002`,
      userId: 2,
      customerName: 'Test Customer 2',
      customerPhone: '01733333333',
      subtotal: 0, // will be computed by service in Session 3.2
      deliveryFee: 50.0,
      total: 50.0,
    },
  });

  // Create items (using existing vendor 1 and category 1 — fallback if seed didn't create)
  const vendor = await prisma.vendor.findFirst();
  const product = await prisma.product.findFirst();
  if (!vendor || !product) {
    console.info('   ⚠ Skipping items: no vendor/product exists yet');
  } else {
    await prisma.orderItem.createMany({
      data: [
        {
          orderId: order2.id,
          productId: product.id,
          vendorId: vendor.id,
          productNameSnapshot: 'Test Product A',
          priceSnapshot: 50.0,
          qty: 2,
          lineTotal: 100.0,
        },
        {
          orderId: order2.id,
          productId: product.id,
          vendorId: vendor.id,
          productNameSnapshot: 'Test Product B',
          priceSnapshot: 25.0,
          qty: 1,
          lineTotal: 25.0,
        },
      ],
    });
    const items = await prisma.orderItem.findMany({ where: { orderId: order2.id } });
    console.info(`   ✓ Created ${items.length} order items for ${order2.orderCode}`);
  }

  // ─── 4. Insert a status_log row (audit trail) ──────────
  console.info('\n→ Inserting status_log row...');
  const log1 = await prisma.statusLog.create({
    data: {
      orderId: order1.id,
      fromStatus: null, // initial creation
      toStatus: 'pending',
      changedBy: 2,
    },
  });
  console.info(`   ✓ Log #${log1.id}: NULL → pending`);

  const log2 = await prisma.statusLog.create({
    data: {
      orderId: order1.id,
      fromStatus: 'pending',
      toStatus: 'waiting_vendor',
      changedBy: 2,
    },
  });
  console.info(`   ✓ Log #${log2.id}: pending → waiting_vendor`);

  const log3 = await prisma.statusLog.create({
    data: {
      orderId: order1.id,
      fromStatus: 'waiting_vendor',
      toStatus: 'preparing',
      changedBy: 2,
      note: 'Vendor confirmed availability',
    },
  });
  console.info(`   ✓ Log #${log3.id}: waiting_vendor → preparing (with note)`);

  // ─── 5. Insert a rating ─────────────────────────────────
  console.info('\n→ Inserting rating...');
  // First need a delivered order for rating to make sense
  const deliveredOrder = await prisma.order.create({
    data: {
      orderCode: `ORD-${year}-00003`,
      userId: 2,
      customerName: 'Rating Customer',
      customerPhone: '01744444444',
      subtotal: 200,
      deliveryFee: 30,
      total: 230,
      status: 'delivered',
      deliveredAt: new Date(),
    },
  });
  const rating = await prisma.rating.create({
    data: {
      orderId: deliveredOrder.id,
      overall: 5,
      speed: 4,
      behavior: 5,
      comment: 'Great service!',
    },
  });
  console.info(`   ✓ Rating #${rating.id}: overall=${rating.overall} speed=${rating.speed}`);

  // Try to add a second rating → unique violation
  try {
    await prisma.rating.create({
      data: { orderId: deliveredOrder.id, overall: 1, speed: 1, behavior: 1 },
    });
    console.info('   ✗ FAILED: second rating was allowed!');
    process.exit(1);
  } catch {
    console.info('   ✓ Correctly rejected: one rating per order (unique constraint)');
  }

  // ─── 6. Verify cascade deletes ───────────────────────────
  console.info('\n→ Testing cascade deletes (deleting order should delete items + logs)...');
  // Ensure a vendor exists for the order_item FK
  let cascadeVendor = vendor;
  if (!cascadeVendor) {
    cascadeVendor = await prisma.vendor.create({
      data: {
        name: 'Cascade Test Vendor',
        phone: '01987654321',
        category: 'other',
      },
    });
    console.info(`   ✓ Created temporary vendor #${cascadeVendor.id}`);
  }
  const cascadeOrder = await prisma.order.create({
    data: {
      orderCode: `ORD-${year}-00004`,
      userId: 2,
      customerName: 'Cascade Test',
      customerPhone: '01755555555',
      subtotal: 50,
      deliveryFee: 0,
      total: 50,
    },
  });
  await prisma.orderItem.create({
    data: {
      orderId: cascadeOrder.id,
      vendorId: cascadeVendor.id,
      productNameSnapshot: 'Cascade Item',
      priceSnapshot: 50,
      qty: 1,
      lineTotal: 50,
    },
  });
  await prisma.statusLog.create({
    data: {
      orderId: cascadeOrder.id,
      toStatus: 'pending',
      changedBy: 2,
    },
  });
  await prisma.order.delete({ where: { id: cascadeOrder.id } });
  const orphanItems = await prisma.orderItem.count({
    where: { orderId: cascadeOrder.id },
  });
  const orphanLogs = await prisma.statusLog.count({
    where: { orderId: cascadeOrder.id },
  });
  if (orphanItems === 0 && orphanLogs === 0) {
    console.info('   ✓ Cascade delete works: items + logs gone after order delete');
  } else {
    console.info(`   ✗ FAILED: orphan items=${orphanItems} orphan logs=${orphanLogs}`);
    process.exit(1);
  }

  // ─── Cleanup ──────────────────────────────────────────────
  await prisma.statusLog.deleteMany({});
  await prisma.rating.deleteMany({});
  await prisma.orderItem.deleteMany({});
  await prisma.order.deleteMany({});
  // If we created a temporary cascade vendor, clean it up too
  if (cascadeVendor && (!vendor || cascadeVendor.id !== vendor.id)) {
    await prisma.vendor.delete({ where: { id: cascadeVendor.id } });
  }
  console.info('\n✓ Cleaned up — all schema tests succeeded.\n');
}

main()
  .catch((err) => {
    console.error('\n❌ Smoke test failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
