import { PrismaClient } from '@prisma/client';
import { env } from './env';

/**
 * Prisma Client singleton.
 *
 * In development we attach the client to `global.prisma` so that hot-reloading
 * via `tsx watch` / `nodemon` does not spawn dozens of Prisma clients (each one
 * opens its own connection pool — exhausting DB connections).
 *
 * In production we just create one client per process.
 */
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const prismaClient = new PrismaClient({
  log: env.isDev ? ['query', 'warn', 'error'] : ['warn', 'error'],
});

if (env.isDev) {
  global.prisma = prismaClient;
}

export const prisma = global.prisma ?? prismaClient;
