import 'dotenv/config';
import { z } from 'zod';

// ─── Schema ─────────────────────────────────────────────────────
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  APP_BASE_URL: z.string().url().default('http://localhost:3000'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 chars'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 chars'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),

  SUPER_ADMIN_EMAIL: z.string().email().default('admin@rizqun.com'),
  SUPER_ADMIN_PASSWORD: z.string().min(8).default('ChangeMeInProduction123!'),

  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:5173'),
});

// ─── Parse & validate ───────────────────────────────────────────
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:\n');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

// ─── Export shaped config ──────────────────────────────────────
export const env = {
  nodeEnv: parsed.data.NODE_ENV,
  isProd: parsed.data.NODE_ENV === 'production',
  isDev: parsed.data.NODE_ENV === 'development',
  port: parsed.data.PORT,
  appBaseUrl: parsed.data.APP_BASE_URL,

  databaseUrl: parsed.data.DATABASE_URL,

  jwt: {
    accessSecret: parsed.data.JWT_ACCESS_SECRET,
    refreshSecret: parsed.data.JWT_REFRESH_SECRET,
    accessTtl: parsed.data.JWT_ACCESS_TTL,
    refreshTtl: parsed.data.JWT_REFRESH_TTL,
  },

  superAdmin: {
    email: parsed.data.SUPER_ADMIN_EMAIL,
    password: parsed.data.SUPER_ADMIN_PASSWORD,
  },

  corsOrigins: parsed.data.CORS_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};
