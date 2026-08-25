# Rizqun

Order management system for receiving customer calls, building orders on the fly, splitting them vendor-wise, and tracking them through delivery.

> **Stack:** Node.js + Express + PostgreSQL + Prisma + JWT
> **Status:** Phase 0 — Project setup

## Setup

### Prerequisites

- Node.js ≥ 20
- npm ≥ 10
- PostgreSQL ≥ 14

### Database setup

After installing PostgreSQL, create the database and user:

```sql
-- run as a superuser (e.g. `psql -U postgres`)
CREATE USER rizqun_user WITH PASSWORD 'rizqun_password' CREATEDB;
CREATE DATABASE rizqun_db OWNER rizqun_user;
GRANT ALL PRIVILEGES ON DATABASE rizqun_db TO rizqun_user;
```

> `CREATEDB` is required because Prisma Migrate creates a temporary shadow database during dev migrations.

### Install

```bash
git clone https://github.com/sajidchowdhury/rizqun.git
cd rizqun
npm ci
```

### Configure

```bash
cp .env.example .env
# edit .env — set DATABASE_URL, JWT secrets, super admin password
```

> If your shell has a system-wide `DATABASE_URL` env var that conflicts with the one in `.env`, run `unset DATABASE_URL` before starting the server or running migrations. This is purely a development-machine issue.

Generate strong JWT secrets:

```bash
openssl rand -hex 32  # use for JWT_ACCESS_SECRET
openssl rand -hex 32  # use for JWT_REFRESH_SECRET
```

### Run in development

```bash
npm run dev
```

Server boots on `http://localhost:3000`.

### Verify

```bash
curl http://localhost:3000/health
# expected: { "status": "ok", "service": "rizqun-api", ..., "database": { "status": "ok", "latencyMs": <number> } }
```

### Run migrations

```bash
unset DATABASE_URL   # if your shell has a system-wide override
npx prisma migrate dev --name <migration_name>
```

### Open Prisma Studio (DB GUI)

```bash
npx prisma studio
# opens at http://localhost:5555
```

### DB smoke test

```bash
unset DATABASE_URL && npx tsx scripts/db-smoke-test.ts
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start with hot-reload (tsx watch) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled `dist/server.js` |
| `npm run lint` | Lint all `.ts` files with ESLint |
| `npm run lint:fix` | Lint and auto-fix where possible |
| `npm run format` | Format all source files with Prettier |
| `npm run format:check` | Check formatting without writing (used in CI) |
| `npx prisma migrate dev --name <name>` | Create + apply a new migration |
| `npx prisma studio` | Open DB GUI at `localhost:5555` |
| `npx tsx scripts/db-smoke-test.ts` | Run DB CRUD smoke test |

## Code quality

This project uses:

- **ESLint 9** (flat config in `eslint.config.mjs`) with `typescript-eslint` recommended rules
- **Prettier 3** (config in `.prettierrc.json`) — single quotes, semicolons, trailing commas
- **EditorConfig** (`.editorconfig`) — UTF-8, LF, 2-space indent

Key rules:

- `no-console` → warn (allow `console.warn/error/info`); use the `info` variant for startup banners
- `prefer-const`, `no-var`, `eqeqeq` → error
- `@typescript-eslint/no-unused-vars` → error, with `_` prefix for intentionally-unused params (`_req`, `_next`)
- `@typescript-eslint/no-explicit-any` → warn
- `no-throw-literal` → error (throw `AppError` instances, not strings)
- `eslint-config-prettier` disables formatting rules that conflict with Prettier

## Project structure

```
rizqun/
├── src/
│   ├── config/         # env, prisma client
│   ├── modules/        # feature modules (auth, users, products, orders, ...)
│   ├── middlewares/    # auth, role, category-scope guards
│   ├── utils/          # response, AppError, helpers
│   ├── app.ts          # express app + middlewares
│   └── server.ts       # entry point
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

## Documentation

- [`implementation-guide.md`](./implementation-guide.md) — full system design
- [`implementation-plan.md`](./implementation-plan.md) — phase-by-phase build plan
