import { env } from './config/env';
import { prisma } from './config/prisma';
import { logger } from './config/logger';
import { app } from './app';

const server = app.listen(env.port, () => {
  logger.info(
    {
      port: env.port,
      env: env.nodeEnv,
      baseUrl: env.appBaseUrl,
    },
    `Rizqun API started — port ${env.port} (${env.nodeEnv})`,
  );
});

// ─── Graceful shutdown ─────────────────────────────────────────
const shutdown = (signal: string) => {
  logger.info({ signal }, `${signal} received, shutting down gracefully...`);
  server.close(async () => {
    logger.info('HTTP server closed.');
    try {
      await prisma.$disconnect();
      logger.info('Database disconnected.');
    } catch (err) {
      logger.error({ err }, 'Error disconnecting database');
    }
    process.exit(0);
  });

  // Force-close after 10s if hanging connections
  setTimeout(() => {
    logger.error('Forcing shutdown after 10s timeout.');
    process.exit(1);
  }, 10_000).unref();
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled Rejection');
});

process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught Exception');
  process.exit(1);
});
