import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { env } from './config/env';
import { prisma } from './config/prisma';
import { logger } from './config/logger';
import { AppError } from './utils/AppError';
import { generalApiLimiter } from './middlewares/rate-limiters';
import authRoutes from './modules/auth/auth.routes';
import vendorRoutes from './modules/vendors/vendors.routes';
import productRoutes from './modules/products/products.routes';
import orderRoutes from './modules/orders/orders.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';
import ratingRoutes from './modules/ratings/ratings.routes';
import userRoutes from './modules/users/users.routes';
import categoryRoutes from './modules/categories/categories.routes';

const app = express();

// ─── Security & parsing middlewares ───────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      // allow same-origin / curl (no origin) and any whitelisted origin
      if (!origin || env.corsOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ─── Structured request logging ────────────────────────────────
// Replaces morgan with pino-http for structured JSON logs.
// Each request gets logged with: method, url, statusCode, responseTime,
// ip, and userId (if authenticated).
app.use(
  pinoHttp({
    logger,
    // Custom request serializer — adds userId if available
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    customSuccessMessage: (req, res) => {
      const userId = (req as any).user?.userId;
      const ms = (res as any).responseTime ?? 0;
      return `${req.method} ${req.url} → ${res.statusCode} (${ms}ms)${userId ? ` user=${userId}` : ''}`;
    },
    customErrorMessage: (req, res, err) => {
      const userId = (req as any).user?.userId;
      const ms = (res as any).responseTime ?? 0;
      return `${req.method} ${req.url} → ${res.statusCode} (${ms}ms)${userId ? ` user=${userId}` : ''} error=${err.message}`;
    },
    // Don't log health checks (they'd flood the log)
    autoLogging: {
      ignore: (req) => req.url === '/health',
    },
  }),
);

// ─── General API rate limiter ─────────────────────────────────
app.use(generalApiLimiter);

// ─── Routes ─────────────────────────────────────────────────────
app.use('/auth', authRoutes);
app.use('/vendors', vendorRoutes);
app.use('/products', productRoutes);
app.use('/orders', orderRoutes);
app.use('/ratings', ratingRoutes);
app.use('/users', userRoutes);
app.use('/categories', categoryRoutes);
app.use('/dashboard', dashboardRoutes);

// ─── Static files (product images, etc.) ──────────────────────
// Images are stored in public/uploads/products/ and served at
// /uploads/products/xxx.jpg. In production, Nginx serves this path
// directly for better performance.
app.use('/uploads', express.static('public/uploads'));

// ─── Health check ──────────────────────────────────────────────
app.get('/health', async (_req: Request, res: Response) => {
  let dbStatus: 'ok' | 'error' = 'ok';
  let dbLatencyMs: number | undefined;
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - start;
  } catch {
    dbStatus = 'error';
  }

  const overall = dbStatus === 'ok' ? 'ok' : 'degraded';

  res.status(200).json({
    status: overall,
    service: 'rizqun-api',
    version: process.env.npm_package_version ?? '0.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: env.nodeEnv,
    database: {
      status: dbStatus,
      latencyMs: dbLatencyMs,
    },
  });
});

// ─── 404 handler ───────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: 'Not found',
  });
});

// ─── Global error handler ──────────────────────────────────────
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  // Structured error logging via pino
  const reqLogger = (req as any).log ?? logger;

  if (err instanceof AppError) {
    // Operational errors — log at warn (expected, handled)
    reqLogger.warn(
      {
        err: { message: err.message, statusCode: err.statusCode, code: err.code },
        requestId: (req as any).id,
      },
      `AppError: ${err.message}`,
    );
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.code ? { code: err.code } : {}),
    });
    return;
  }

  if (err.message.startsWith('Origin ')) {
    reqLogger.warn(
      { err: err.message, requestId: (req as any).id },
      `CORS blocked: ${err.message}`,
    );
    res.status(403).json({ success: false, message: err.message });
    return;
  }

  // Unhandled errors — log at error with full stack trace
  reqLogger.error(
    {
      err: { message: err.message, stack: err.stack, name: err.name },
      requestId: (req as any).id,
      url: req.url,
      method: req.method,
    },
    `Unhandled error: ${err.message}`,
  );

  res.status(500).json({
    success: false,
    message: env.nodeEnv === 'production' ? 'Internal server error' : err.message,
  });
});

export { app };
