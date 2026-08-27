// scripts/create-admin.ts
//
// Quick utility: creates (or refreshes) the super admin user.
//
// Run when:
//   - You imported products via bulk-import-* but the user table is still
//     empty (login fails with "Invalid email or password")
//   - You want to reset the admin password to whatever's in .env
//
// Usage:
//   npx tsx scripts/create-admin.ts
//
// The script reads SUPER_ADMIN_EMAIL + SUPER_ADMIN_PASSWORD from .env
// (falling back to admin@rizqun.com / ChangeMeInProduction123! if not set).
// It's idempotent — safe to run multiple times.

import 'dotenv/config';
import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL ?? 'admin@rizqun.com';
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD ?? 'ChangeMeInProduction123!';
const BCRYPT_COST = 12;

async function main() {
  console.info('\n👤 Creating / refreshing super admin...\n');

  const passwordHash = await bcrypt.hash(SUPER_ADMIN_PASSWORD, BCRYPT_COST);

  const admin = await prisma.user.upsert({
    where: { email: SUPER_ADMIN_EMAIL },
    // Create path — used if the user doesn't exist yet
    create: {
      name: 'Super Admin',
      email: SUPER_ADMIN_EMAIL,
      phone: '+880000000000',
      passwordHash,
      role: UserRole.super_admin,
      categoryAccess: ['all'],
      isActive: true,
    },
    // Update path — used if the user already exists (refreshes password
    // + role + categoryAccess so the script is safe to re-run any time)
    update: {
      passwordHash,
      role: UserRole.super_admin,
      categoryAccess: ['all'],
      isActive: true,
    },
  });

  console.info('✅ Super admin ready:\n');
  console.info(`   Email:    ${admin.email}`);
  console.info(`   Password: ${SUPER_ADMIN_PASSWORD}  (from .env)`);
  console.info(`   Role:     ${admin.role}`);
  console.info(`   User ID:  ${admin.id}`);
  console.info(
    `\n   Login at: http://localhost:5173/login\n`,
  );
}

main()
  .catch((err) => {
    console.error('\n❌ Failed:\n', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
