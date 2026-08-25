import { env } from './config/env';
import { app } from './app';

const server = app.listen(env.port, () => {
  console.log(`\n─────────────────────────────────────────────`);
  console.log(`  Rizqun API`);
  console.log(`  Environment : ${env.nodeEnv}`);
  console.log(`  Port         : ${env.port}`);
  console.log(`  Base URL     : ${env.appBaseUrl}`);
  console.log(`  Health       : ${env.appBaseUrl}/health`);
  console.log(`─────────────────────────────────────────────\n`);
});

// ─── Graceful shutdown ─────────────────────────────────────────
const shutdown = (signal: string) => {
  console.log(`\n${signal} received, shutting down gracefully...`);
  server.close(() => {
    console.log('Server closed.');
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
