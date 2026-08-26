import pino from 'pino';
import { env } from './env';

// ─── Logger configuration ─────────────────────────────────────
//
// In development: pretty-printed logs (colored, readable)
// In production: newline-delimited JSON (for log aggregation tools like
//   Loki, Datadog, CloudWatch Logs)
//
// Log levels:
//   fatal → process crash, data loss
//   error → unhandled errors, 500s
//   warn  → rate-limited, validation errors, soft failures
//   info  → request logs, status transitions, order lifecycle
//   debug → Prisma query logs (dev only)
//   trace → very verbose (not used)
//
// Log rotation in production is handled by PM2 (pm2-logrotate) —
// the logger writes to stdout/stderr, PM2 captures and rotates.

const isDev = env.isDev;

export const logger = pino({
  level: isDev ? 'debug' : 'info',
  base: {
    service: 'rizqun-api',
    env: env.nodeEnv,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname',
          },
        },
      }
    : {
        // Production: raw JSON to stdout
        // No transport — pino writes directly (fastest)
      }),
});
