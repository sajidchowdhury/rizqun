// One-off script: verify DB write/read works end-to-end.
// Run with: unset DATABASE_URL && npx tsx scripts/db-smoke-test.ts

import { prisma } from '../src/config/prisma';

async function main() {
  console.log('\n=== DB Smoke Test ===\n');

  // Clean slate
  await prisma.user.deleteMany({});
  console.log('Cleared existing rows.');

  // Create
  const created = await prisma.user.create({
    data: { email: 'smoke-test@rizqun.com' },
  });
  console.log('Created row:', created);

  // Read
  const all = await prisma.user.findMany();
  console.log(`Found ${all.length} row(s):`, all);

  // Update
  const updated = await prisma.user.update({
    where: { id: created.id },
    data: { email: 'renamed@rizqun.com' },
  });
  console.log('Updated row:', updated);

  // Delete
  await prisma.user.delete({ where: { id: created.id } });
  const afterDelete = await prisma.user.findMany();
  console.log(`After delete: ${afterDelete.length} row(s)`);

  console.log('\n=== All DB operations succeeded ✅ ===');
}

main()
  .catch((err) => {
    console.error('Smoke test failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
