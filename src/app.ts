import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { prisma } from './config/prisma';
import { AppError } from './utils/AppError';
import authRoutes from './modules/auth/auth.routes';
import vendorRoutes from './modules/vendors/vendors.routes';
import productRoutes from './modules/products/products.routes';
import orderRoutes from './modules/orders/orders.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';
import ratingRoutes from './modules/ratings/ratings.routes';

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

// ─── Logging ──────────────────────────────────────────────────
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

// ─── Routes ─────────────────────────────────────────────────────
app.use('/auth', authRoutes);
app.use('/vendors', vendorRoutes);
app.use('/products', productRoutes);
app.use('/orders', orderRoutes);
app.use('/ratings', ratingRoutes);
app.use('/dashboard', dashboardRoutes);

// ─── Health check ──────────────────────────────────────────────
app.get('/health', async (_req: Request, res: Response) => {
  // Probe DB connection
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
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.code ? { code: err.code } : {}),
    });
    return;
  }

  if (err.message.startsWith('Origin ')) {
    res.status(403).json({ success: false, message: err.message });
    return;
  }

  console.error('[UNHANDLED ERROR]', err);
  res.status(500).json({
    success: false,
    message: env.nodeEnv === 'production' ? 'Internal server error' : err.message,
  });
});

export { app };
