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

### Seed the database (categories + super admin)

```bash
unset DATABASE_URL   # if your shell has a system-wide override
npx prisma db seed
```

This creates:

- 3 categories: `grocery`, `medicine`, `other`
- 1 super admin user using `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` from `.env`

The seed is **idempotent** — running it multiple times produces the same end state.

### DB smoke test

```bash
unset DATABASE_URL && npx tsx scripts/db-smoke-test.ts
```

> Note: the smoke test deletes all rows in the `users` table. Do not run it against a database with real users.

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
| `npx prisma db seed` | Seed categories + super admin (idempotent) |
| `npx prisma studio` | Open DB GUI at `localhost:5555` |
| `npx tsx scripts/db-smoke-test.ts` | Run DB CRUD smoke test (CAUTION: clears users table) |

## Auth & permissions

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/login` | public | Login — returns access token + sets refresh cookie |
| POST | `/auth/refresh` | refresh cookie | Issues new access token + rotates refresh cookie |
| POST | `/auth/logout` | public | Clears refresh cookie |
| POST | `/auth/register` | `super_admin` | Creates a new user (operator or super_admin) |
| GET | `/auth/me` | any authed | Returns the current user |
| GET | `/vendors` | any authed | List vendors (paginated, filter by `category`/`isActive`/`search`) |
| GET | `/vendors/:id` | any authed | Get one vendor |
| POST | `/vendors` | `super_admin` | Create a vendor |
| PATCH | `/vendors/:id` | `super_admin` | Update a vendor (partial) |
| DELETE | `/vendors/:id` | `super_admin` | Soft-delete a vendor (blocked if active products exist) |
| GET | `/products?page=&limit=&categoryId=&vendorId=&isActive=&category=&search=` | any authed | List products (paginated, filterable) |
| GET | `/products/search?q=&limit=&category=` | any authed | Smart search (FTS + ILIKE fallback, scoped by user's categoryAccess) |
| GET | `/products/:id` | any authed | Get one product (with category + vendor nested) |
| POST | `/products` | `super_admin` | Create a product (`search_vector` auto-maintained by trigger) |
| POST | `/products/quick-add` | any authed (scoped) | Operator-side quick-add — auto-generates SKU, scoped by user's `categoryAccess` |
| PATCH | `/products/:id` | `super_admin` | Update a product (partial; SKU conflict → 409) |
| DELETE | `/products/:id` | `super_admin` | Soft-delete a product (`isActive=false`) |
| POST | `/orders` | any authed (scoped) | Finalize cart — snapshots product name/price, computes totals, creates order + status_log |
| GET | `/orders?page=&limit=&status=&from=&to=&search=` | any authed (scoped) | Paginated list (operators see own only, super_admin sees all) |
| GET | `/orders/:id` | any authed (scoped) | Full order detail with items + nested vendor info (404 if not own) |

### Middlewares (in `src/middlewares/`)

| Middleware | Purpose |
|------------|---------|
| `authenticate` | Verifies `Authorization: Bearer <token>`, sets `req.user` |
| `requireRole(...roles)` | Allows only the specified roles — must come after `authenticate` |
| `categoryScope` | Reads `req.user.categoryAccess`, sets `req.categoryFilter` (`{ hasAll, slugs }`) |

### Quick start

```bash
# 1. Login as super admin (created by seed)
curl -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@rizqun.com","password":"ChangeMeInProduction123!"}'

# 2. Use the access token
TOKEN="<from step 1>"
curl http://localhost:3000/auth/me -H "Authorization: Bearer $TOKEN"

# 3. Create a new operator (super_admin only)
curl -X POST http://localhost:3000/auth/register \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "name":"Operator 1",
    "email":"op1@rizqun.com",
    "phone":"01712345678",
    "password":"Password123",
    "role":"user",
    "categoryAccess":["grocery"]
  }'
```

## Schema overview

| Table | Purpose |
|-------|---------|
| `users` | Super admins + operators (role enum, JSONB category_access) |
| `categories` | Product categories (grocery, medicine, other) — seeded |
| `vendors` | Suppliers (name, phone, whatsapp_number, category enum) |
| `products` | Catalog items (name, sku, price, category_id, vendor_id, unit, search_vector tsvector) |
| `orders` | Customer orders (order_code, customer info, subtotal/delivery_fee/total, status enum, rating_token) |
| `order_items` | Snapshot rows per order (product_id nullable, vendor_id denormalized, name/price snapshot, qty, line_total, added_after_finalize) |
| `status_log` | Append-only audit trail of every status transition (from_status, to_status, changed_by, note) |
| `ratings` | Customer rating per order (overall, speed, behavior, comment) — unique on order_id |

### Order status lifecycle

```
pending → waiting_vendor → preparing → picked_up → delivered
       ↘               ↘            ↘
        cancelled      cancelled     cancelled
```

Any state except `picked_up`/`delivered`/`cancelled` can transition to `cancelled`. `picked_up` → `delivered` is the only valid forward path from `picked_up`.

### Full-text search

`products.search_vector` is a PostgreSQL `tsvector` column auto-maintained by a trigger:

```sql
-- Trigger: products_search_vector_trigger
-- Fires BEFORE INSERT OR UPDATE on products
-- Sets search_vector = to_tsvector('english', name)
```

A GIN index on `search_vector` enables fast full-text queries:

```sql
SELECT id, name, ts_rank(search_vector, q) AS rank
FROM products, to_tsquery('english', 'paracetamol') q
WHERE search_vector @@ q
ORDER BY rank DESC
LIMIT 20;
```

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
