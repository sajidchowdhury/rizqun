import { env } from './config/env';
import { prisma } from './config/prisma';
import { app } from './app';

const server = app.listen(env.port, () => {
  console.info(`\n─────────────────────────────────────────────`);
  console.info(`  Rizqun API`);
  console.info(`  Environment : ${env.nodeEnv}`);
  console.info(`  Port         : ${env.port}`);
  console.info(`  Base URL     : ${env.appBaseUrl}`);
  console.info(`  Health       : ${env.appBaseUrl}/health`);
  console.info(`─────────────────────────────────────────────\n`);
});

// ─── Graceful shutdown ─────────────────────────────────────────
const shutdown = (signal: string) => {
  console.info(`\n${signal} received, shutting down gracefully...`);
  server.close(async () => {
    console.info('HTTP server closed.');
    try {
      await prisma.$disconnect();
      console.info('Database disconnected.');
    } catch (err) {
      console.error('Error disconnecting database:', err);
    }
    process.exit(0);
  });

  // Force-close after 10s if hanging connections
  setTimeout(() => {
    console.error('Forcing shutdown after 10s timeout.');
    process.exit(1);
  }, 10_000).unref();
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});
