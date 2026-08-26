# Rizqun — Phase-by-Phase Implementation Plan

> **Stack:** Node.js + Express + PostgreSQL + Prisma + JWT
> **Repo:** https://github.com/sajidchowdhury/rizqun
> **Approach:** Phase-by-phase, session-by-session. Each session ends with a **confirmation checkpoint** — the next session does not start until the previous session's deliverables are reviewed and approved.

---

## How to Read This Plan

- A **Phase** is a major milestone (e.g. "Auth foundation").
- A **Session** is a single working unit (typically 2–4 hours of focused dev). Each session has:
  - **Goal** — what we're trying to achieve
  - **Tasks** — concrete checklist
  - **Deliverables** — files / endpoints / DB changes produced
  - **Confirmation Checkpoint** — what to verify before moving on
- After every session, ping the project owner with the checklist results. Only after explicit "✅ confirmed" do we proceed to the next session.

**Total phases:** 11
**Total sessions:** 38
**Estimated duration:** 6–8 weeks (one developer, part-time)

---

## Phase 0 — Project Setup & Tooling

### Session 0.1 — Repo & Local Environment

**Goal:** Get an empty, runnable Node+TS+Express project committed to GitHub.

**Tasks:**
- [ ] Initialize `package.json` with `npm init`
- [ ] Install: `express`, `cors`, `helmet`, `morgan`, `dotenv`, `zod`, `jsonwebtoken`, `bcryptjs`, `@prisma/client`, `pg`
- [ ] Install dev: `typescript`, `tsx`, `nodemon`, `@types/*`, `prisma`, `eslint`, `prettier`
- [ ] Create `tsconfig.json` (strict mode, ES2022)
- [ ] Create `src/app.ts` and `src/server.ts` with a `/health` route returning `{ status: 'ok' }`
- [ ] Create `.env.example` with `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `APP_BASE_URL`, `PORT`, `NODE_ENV`
- [ ] Create `.gitignore` (node_modules, .env, dist, .DS_Store)
- [ ] Create `README.md` with setup steps
- [ ] Commit & push to `main` branch

**Deliverables:**
- Empty Express server that boots and responds to `/health`
- TypeScript compiles cleanly
- Repo is on GitHub

**Confirmation Checkpoint:**
- `git clone` works on a fresh machine
- `npm ci && npm run dev` boots server on port 3000
- `curl localhost:3000/health` → `{ "status": "ok" }`
- `.env` is NOT in the repo (verify on GitHub)

---

### Session 0.2 — Prisma + PostgreSQL Setup

**Goal:** Have a working Prisma client and an empty DB connected.

**Tasks:**
- [ ] Install PostgreSQL locally (or provision a managed instance)
- [ ] Create database `rizqun_db` and user `rizqun_user`
- [ ] Initialize Prisma: `npx prisma init`
- [ ] Configure `DATABASE_URL` in `.env`
- [ ] Add first model `User` (just `id`, `email`, `createdAt`) to test migration
- [ ] Run `npx prisma migrate dev --name init`
- [ ] Create `src/config/prisma.ts` (Prisma client singleton)
- [ ] Create `src/config/env.ts` (loads + validates env with Zod)

**Deliverables:**
- `prisma/schema.prisma` with first model
- `prisma/migrations/` folder with initial migration
- Working DB connection

**Confirmation Checkpoint:**
- `npx prisma studio` opens and shows the `User` table
- Server logs "DB connected" on boot
- A test row can be inserted via Prisma Studio

---

### Session 0.3 — Linting, Formatting, Project Structure

**Goal:** Establish coding standards before any feature code.

**Tasks:**
- [ ] Configure ESLint (`@typescript-eslint/recommended`)
- [ ] Configure Prettier (single quotes, no-semi OFF — pick a style, stick to it)
- [ ] Add `npm run lint` and `npm run format` scripts
- [ ] Create folder skeleton: `src/modules/`, `src/middlewares/`, `src/utils/`, `src/config/`
- [ ] Create `src/utils/response.ts` with `sendSuccess(res, data, msg)` and `sendError(res, code, msg)` helpers
- [ ] Create `src/utils/AppError.ts` custom error class
- [ ] Add a global error handler middleware

**Deliverables:**
- Lint passes on a clean checkout
- Consistent error response shape: `{ success: boolean, message: string, data: any }`

**Confirmation Checkpoint:**
- `npm run lint` exits 0
- Hitting an unknown route returns `{ success: false, message: "Not found" }` with status 404

---

## Phase 1 — Authentication & User Foundation

### Session 1.1 — Full User Schema + Migration

**Goal:** Define the complete `User` model with role and category access.

**Tasks:**
- [ ] Add `Category` model (id, slug, name)
- [ ] Update `User` model with: `name`, `email` (unique), `phone`, `passwordHash`, `role` (enum: `super_admin | user`), `categoryAccess` (JsonB), `isActive`, `createdAt`, `updatedAt`
- [ ] Seed `categories` table with `grocery`, `medicine`, `other`
- [ ] Seed first super admin (`admin@rizqun.com` / default password from env)
- [ ] Run `npx prisma migrate dev --name add_users_and_categories`
- [ ] Create `prisma/seed.ts`

**Deliverables:**
- Migrated DB with `users` and `categories` tables
- Seed script that creates admin + categories

**Confirmation Checkpoint:**
- `npx prisma db seed` runs without error
- `SELECT * FROM users;` shows the admin row with `category_access = ["all"]`
- `SELECT * FROM categories;` shows 3 rows

---

### Session 1.2 — Auth Service (Register + Login + Refresh)

**Goal:** Working JWT-based auth with refresh tokens.

**Tasks:**
- [ ] Create `src/modules/auth/auth.routes.ts`, `auth.controller.ts`, `auth.service.ts`, `auth.dto.ts`
- [ ] Implement `POST /auth/register` (super_admin only — guarded later)
- [ ] Implement `POST /auth/login` — returns `{ accessToken, user }` + sets `refreshToken` in `httpOnly` cookie
- [ ] Implement `POST /auth/refresh` — reads cookie, issues new accessToken
- [ ] Implement `POST /auth/logout` — clears cookie
- [ ] Implement `GET /auth/me` — returns current user
- [ ] Use bcrypt with cost factor 12
- [ ] Access token TTL: 15m, Refresh TTL: 7d

**Deliverables:**
- 5 auth endpoints, all working via Postman

**Confirmation Checkpoint:**
- Login with admin@rizqun.com returns a valid JWT
- Decoded token contains `userId`, `role`, `categoryAccess`
- Hitting `/auth/me` without token → 401
- Refresh token cookie has `httpOnly: true`, `secure: true` (in prod), `sameSite: 'strict'`

---

### Session 1.3 — Auth Middlewares

**Goal:** Reusable guards for protected routes.

**Tasks:**
- [ ] `src/middlewares/auth.middleware.ts` — `authenticate` (verifies access token, sets `req.user`)
- [ ] `src/middlewares/role.middleware.ts` — `requireRole('super_admin')` factory
- [ ] `src/middlewares/category-scope.middleware.ts` — exposes `req.categoryFilter` based on `req.user.categoryAccess`
- [ ] Apply `authenticate` to all `/users`, `/products`, `/orders`, `/vendors`, `/dashboard` routes
- [ ] Apply `requireRole('super_admin')` to `/users` write routes

**Deliverables:**
- Three reusable middleware functions

**Confirmation Checkpoint:**
- Calling `GET /users` without token → 401
- Calling `GET /users` with a `user` role token → 403
- Calling `GET /users` with super_admin token → 200

---

## Phase 2 — Product Catalog & Smart Search

### Session 2.1 — Vendor + Product Schema

**Goal:** Define and migrate the vendor and product tables.

**Tasks:**
- [ ] Add `Vendor` model: `id`, `name`, `phone`, `whatsappNumber`, `category` (enum), `isActive`, timestamps
- [ ] Add `Product` model: `id`, `name`, `sku` (unique), `price`, `categoryId`, `vendorId`, `unit`, `searchVector` (Unsupported type — raw SQL), `isActive`, timestamps
- [ ] Run migration
- [ ] Manually add GIN index via raw SQL migration: `CREATE INDEX products_search_idx ON products USING GIN (search_vector);`
- [ ] Add partial index: `CREATE INDEX products_active_idx ON products (id) WHERE is_active = true;`

**Deliverables:**
- `vendors` and `products` tables live in DB
- Search indexes in place

**Confirmation Checkpoint:**
- `npx prisma studio` shows both tables
- `\d products` in psql shows the GIN index
- Inserting a product with `INSERT ... SELECT to_tsvector('english', 'Paracetamol 500') AS search_vector` works

---

### Session 2.2 — Vendor CRUD

**Goal:** Super admin can manage vendors.

**Tasks:**
- [ ] Create `src/modules/vendors/` module
- [ ] `GET /vendors` — list (paginated, filterable by category)
- [ ] `POST /vendors` — create (super_admin only)
- [ ] `PATCH /vendors/:id` — update (super_admin only)
- [ ] `DELETE /vendors/:id` — soft delete (`isActive = false`)
- [ ] Validate input with Zod

**Deliverables:**
- Full vendor CRUD

**Confirmation Checkpoint:**
- Can create, list, update, soft-delete vendors via Postman
- `phone` is validated as E.164 or local BD format
- Deleting a vendor with active products is blocked (or cascades to soft-delete)

---

### Session 2.3 — Product CRUD (Super Admin Side)

**Goal:** Super admin can bulk-manage products.

**Tasks:**
- [ ] Create `src/modules/products/` module
- [ ] `POST /products` — create (super_admin only)
- [ ] `PATCH /products/:id` — update (super_admin only)
- [ ] `DELETE /products/:id` — soft delete (super_admin only)
- [ ] `GET /products/:id` — get one
- [ ] On insert/update, auto-compute `searchVector = to_tsvector('english', name)` via raw SQL trigger or Prisma's `executeRaw`

**Deliverables:**
- Product write endpoints working

**Confirmation Checkpoint:**
- Create 5 test products across 2 vendors
- `SELECT name, search_vector FROM products;` shows populated tsvector
- Searching "para" returns Paracetamol via FTS

---

### Session 2.4 — Smart Search Endpoint

**Goal:** The fast debounced search the operator will use during calls.

**Tasks:**
- [ ] `GET /products?q=&category=&page=&limit=20`
- [ ] Use raw SQL with `tsquery` + `ts_rank` for primary search
- [ ] Fallback to `ILIKE '%q%'` if FTS returns < 5 results
- [ ] Apply `category-scope.middleware` to filter by user's `categoryAccess`
- [ ] Return: `{ id, name, price, unit, vendorName, categoryName }`
- [ ] Cursor pagination (`?after=id`)

**Deliverables:**
- One fast search endpoint

**Confirmation Checkpoint:**
- Load 35K products via seed script
- `GET /products?q=paracetamol` returns in < 100ms
- A user with `categoryAccess=["grocery"]` cannot find any medicine products
- Empty query returns first page of active products

---

### Session 2.5 — Quick-Add Product (Operator Side)

**Goal:** Operator can add a missing product on the fly during a call.

**Tasks:**
- [ ] `POST /products/quick-add` (user role allowed, scoped by `categoryAccess`)
- [ ] Body: `{ name, price, unit, vendorId, categorySlug }`
- [ ] Validate that `categorySlug` is in `req.user.categoryAccess`
- [ ] Auto-generate SKU if not provided
- [ ] Returns the created product (so frontend can push to cart)

**Deliverables:**
- One endpoint specifically for in-call product creation

**Confirmation Checkpoint:**
- Operator with `["grocery"]` access tries to quick-add a medicine product → 403
- Quick-add a grocery product → 201, product appears in subsequent search

---

## Phase 3 — Cart & Order Finalization

### Session 3.1 — Order + OrderItem Schema

**Goal:** Define the order tables.

**Tasks:**
- [ ] Add `Order` model: `id`, `orderCode` (unique), `userId`, `customerName`, `customerPhone`, `customerAddress`, `subtotal`, `deliveryFee`, `total`, `status` (enum), `ratingToken` (unique nullable), `createdAt`, `deliveredAt`
- [ ] Add `OrderItem` model: `id`, `orderId`, `productId` (nullable), `vendorId`, `productNameSnapshot`, `priceSnapshot`, `qty`, `lineTotal`, `addedAfterFinalize`, `addedAt`
- [ ] Add `StatusLog` model: `id`, `orderId`, `fromStatus`, `toStatus`, `changedBy`, `changedAt`, `note`
- [ ] Add `Rating` model: `id`, `orderId`, `overall`, `speed`, `behavior`, `comment`, `submittedAt`
- [ ] Run migration
- [ ] Generate `orderCode` format `ORD-YYYY-NNNNN` via DB sequence or app-side counter

**Deliverables:**
- All order-related tables live

**Confirmation Checkpoint:**
- All 4 tables created in DB
- `\d orders` shows enum status with all 6 values
- Indexes on `orders(status)`, `orders(userId)`, `order_items(orderId)`, `order_items(vendorId)`

---

### Session 3.2 — Finalize Order Endpoint

**Goal:** Convert cart into a saved order.

**Tasks:**
- [ ] `POST /orders` — body: `{ customerName, customerPhone, customerAddress, deliveryFee, items: [{ productId, qty }] }`
- [ ] Validate each item against user's `categoryAccess`
- [ ] Snapshot `name` + `price` into `productNameSnapshot` + `priceSnapshot`
- [ ] Look up `vendorId` from each product
- [ ] Compute `subtotal = Σ (price * qty)`, `total = subtotal + deliveryFee`
- [ ] Insert `Order` with `status='pending'`
- [ ] Insert `OrderItem` rows in a transaction
- [ ] Insert first `StatusLog` row (`fromStatus=NULL`, `toStatus='pending'`)
- [ ] Return full order with items

**Deliverables:**
- `POST /orders` returns a complete order

**Confirmation Checkpoint:**
- Post a 3-item order via Postman → 201
- DB shows 1 order row + 3 order_items + 1 status_log row
- `orderCode` follows `ORD-2026-00001` format
- If a user with `["grocery"]` tries to finalize an order with a medicine item → 400

---

### Session 3.3 — Get Order + List Orders

**Goal:** Read access to orders.

**Tasks:**
- [ ] `GET /orders?status=&page=&from=&to=` — paginated list, scoped by user
- [ ] `GET /orders/:id` — full detail with items joined to vendors
- [ ] Sort by `createdAt DESC`
- [ ] Cursor pagination
- [ ] Scope by user (users see only their own orders; super_admin sees all)

**Deliverables:**
- Two read endpoints

**Confirmation Checkpoint:**
- Create 3 orders → list shows all 3 newest-first
- Filter `?status=pending` works
- User A cannot see User B's order (returns 404 or empty)
- Super admin sees all orders

---

## Phase 4 — Pending List & Status Workflow

### Session 4.1 — Status Update Endpoint + Status Log

**Goal:** Change order status with full audit trail.

**Tasks:**
- [ ] `PATCH /orders/:id/status` — body: `{ status }`
- [ ] Validate transition is allowed (see matrix below)
- [ ] Insert `StatusLog` row with `fromStatus` = current, `toStatus` = new
- [ ] If new status is `delivered`, set `deliveredAt = NOW()`
- [ ] Use a DB transaction

**Allowed transitions:**

```
pending      → waiting_vendor, cancelled
waiting_vendor → preparing, cancelled
preparing    → picked_up, cancelled
picked_up    → delivered
delivered    → (terminal)
cancelled    → (terminal)
```

**Deliverables:**
- Status update endpoint with strict transition validation

**Confirmation Checkpoint:**
- Move order `pending → waiting_vendor → preparing → picked_up → delivered` → all 5 status_log rows exist
- Try `delivered → pending` → 400 with "Invalid transition"
- Try `picked_up → pending` → 400
- `deliveredAt` is set when reaching `delivered`

---

### Session 4.2 — Pending List Endpoint (with filters)

**Goal:** The list operators will use most.

**Tasks:**
- [ ] `GET /orders/pending?page=&customer=` — returns only `status IN ('pending','waiting_vendor','preparing')`
- [ ] Support search by customer name or phone
- [ ] Return summary fields: `itemsCount`, `total`, `status`, `createdAt`
- [ ] Add a "minutes since created" computed field

**Deliverables:**
- One optimized endpoint for the pending list UI

**Confirmation Checkpoint:**
- List excludes delivered / cancelled orders
- Search by partial phone number works
- Response time < 200ms with 1K orders in DB

---

### Session 4.3 — Cancel Order (Soft Delete)

**Goal:** Operators can cancel a wrongly placed order.

**Tasks:**
- [ ] `DELETE /orders/:id` — sets `status='cancelled'`, inserts status_log row
- [ ] Only allowed if current status is `pending`, `waiting_vendor`, or `preparing`
- [ ] Never physically delete rows (audit trail preserved)

**Deliverables:**
- Cancel endpoint

**Confirmation Checkpoint:**
- Cancel a pending order → status = `cancelled`, status_log has entry
- Try to cancel a delivered order → 400
- `SELECT * FROM orders WHERE id=X` still returns the row

---

## Phase 5 — Vendor-wise WhatsApp Logic

### Session 5.1 — Group Order Items by Vendor

**Goal:** Return the order's items pre-grouped by vendor with copy text + WhatsApp URL.

**Tasks:**
- [ ] `GET /orders/:id/vendor-groups` — returns:
  ```
  {
    groups: [
      {
        vendorId, vendorName, vendorPhone, whatsappNumber,
        items: [{ name, qty, unit, price, lineTotal }],
        subtotal,
        copyText,      // pre-formatted multi-line string
        whatsappUrl    // https://wa.me/<number>?text=<urlencoded copyText>
      }
    ]
  }
  ```
- [ ] `copyText` template includes: order code, vendor name, customer info, item list, subtotal, "please confirm"
- [ ] Items marked `addedAfterFinalize=true` get `*NEW*` prefix in copy text

**Deliverables:**
- One endpoint that produces everything the modal needs

**Confirmation Checkpoint:**
- Order with items from 3 vendors → response has 3 groups
- `whatsappUrl` opens WhatsApp Web with text pre-filled (test in browser)
- Copy text is human-readable, line breaks preserved
- New items show `*NEW*` prefix

---

### Session 5.2 — Update Customer Info on Order

**Goal:** Operator can edit customer name/phone inline in the modal.

**Tasks:**
- [ ] `PATCH /orders/:id` — body: `{ customerName?, customerPhone?, customerAddress?, deliveryFee? }`
- [ ] Only allowed while order is editable (`pending`, `waiting_vendor`, `preparing`)
- [ ] Recompute `total` if `deliveryFee` changes

**Deliverables:**
- Partial update endpoint

**Confirmation Checkpoint:**
- Update phone on a pending order → 200
- Try to update on a delivered order → 400
- Changing `deliveryFee` updates `total`

---

## Phase 6 — Edit Pending Order (Add/Remove Items)

### Session 6.1 — Add Item to Pending Order

**Goal:** Customer calls back, wants to add an item.

**Tasks:**
- [ ] `POST /orders/:id/items` — body: `{ productId, qty }`
- [ ] Check `order.status` is in `['pending','waiting_vendor','preparing']` → else 409
- [ ] Validate product is in user's `categoryAccess`
- [ ] Snapshot `name` + `price`
- [ ] Insert `OrderItem` with `addedAfterFinalize=true`
- [ ] Recompute `subtotal` and `total`
- [ ] Return updated order

**Deliverables:**
- Add-item endpoint with edit-lock enforcement

**Confirmation Checkpoint:**
- Add item to a `preparing` order → 201, new item visible with `addedAfterFinalize=true`
- Add item to a `picked_up` order → 409 with "Order is locked"
- `total` reflects the new item

---

### Session 6.2 — Remove Item from Pending Order

**Goal:** Customer calls back, wants to remove an item.

**Tasks:**
- [ ] `DELETE /orders/:id/items/:itemId`
- [ ] Same edit-lock check
- [ ] Delete the `OrderItem` row
- [ ] Recompute `subtotal` and `total`
- [ ] Return updated order

**Deliverables:**
- Remove-item endpoint

**Confirmation Checkpoint:**
- Remove an item → 200, item gone from order
- `total` decreased by the removed line total
- Try to remove from a `picked_up` order → 409

---

### Session 6.3 — Audit Log for Edits

**Goal:** Track every add/remove so dashboard can show "edits per order".

**Tasks:**
- [ ] When adding an item, insert `StatusLog` with `fromStatus = current`, `toStatus = current`, `note = 'added_item:<productId>'`
- [ ] When removing an item, insert `StatusLog` with `note = 'removed_item:<itemId>'`
- [ ] Add a `note` column to `StatusLog` if not present

**Deliverables:**
- Edit operations are auditable

**Confirmation Checkpoint:**
- Add an item → status_log has new row with note `'added_item:42'`
- Remove an item → status_log has new row with note `'removed_item:7'`
- Query `SELECT * FROM status_log WHERE note LIKE 'added_item%'` returns all adds

---

## Phase 7 — Done List & Dashboard

### Session 7.1 — Done List Endpoint

**Goal:** Archive view of delivered orders.

**Tasks:**
- [ ] `GET /orders/done?month=&page=` — returns only `status='delivered'`
- [ ] Include `deliveredAt` in response
- [ ] Support filter by month (`?month=2026-08`)
- [ ] Sort by `deliveredAt DESC`

**Deliverables:**
- Done list endpoint

**Confirmation Checkpoint:**
- List shows only delivered orders
- Filter by month works
- `deliveredAt` is populated for all rows

---

### Session 7.2 — Dashboard Summary Endpoint

**Goal:** Numbers for the dashboard top cards.

**Tasks:**
- [ ] `GET /dashboard/summary?month=2026-08` — returns:
  ```
  {
    doneCount: 342,
    avgTotalMinutes: 47.3,
    avgStepMinutes: {
      pending_to_waiting: 3.2,
      waiting_to_preparing: 18.5,
      preparing_to_picked_up: 21.0,
      picked_up_to_delivered: 4.6
    }
  }
  ```
- [ ] Use window functions + `status_log` for step averages
- [ ] Scope by user (super_admin sees all, user sees only their orders)

**Deliverables:**
- Dashboard summary endpoint with all key metrics

**Confirmation Checkpoint:**
- With 50 delivered orders in the month, response is correct vs. hand-computed values
- Empty month returns zeros, not errors
- Step averages match raw SQL run in psql

---

### Session 7.3 — Dashboard Charts Endpoints

**Goal:** Data for the bar/line/donut charts.

**Tasks:**
- [ ] `GET /dashboard/orders-per-day?days=30` — daily done count for last N days
- [ ] `GET /dashboard/avg-time-per-day?days=30` — daily avg total minutes
- [ ] `GET /dashboard/category-breakdown?month=` — count of orders by category

**Deliverables:**
- Three chart-data endpoints

**Confirmation Checkpoint:**
- Each returns an array of `{ date, value }` or `{ category, value }` objects
- Frontend can directly feed to chart library
- Empty periods return zero-filled arrays (no gaps)

---

## Phase 8 — Customer Rating System

### Session 8.1 — Generate Rating Link

**Goal:** Operator can request a unique rating URL.

**Tasks:**
- [ ] `POST /orders/:id/rating-link` — generates 32-char hex token via `crypto.randomBytes(16).toString('hex')`
- [ ] Save to `order.ratingToken`
- [ ] Return `{ url: 'https://yourapp.com/rate/<token>' }`
- [ ] Only works if `order.status = 'delivered'`
- [ ] If a token already exists, return the existing URL (don't regenerate)

**Deliverables:**
- Endpoint that produces a public rating URL

**Confirmation Checkpoint:**
- Generate link for a delivered order → 200 with URL
- Generate link for a pending order → 400
- Calling twice returns the same URL

---

### Session 8.2 — Public Rating Form Data + Submit

**Goal:** Customer fills the form without logging in.

**Tasks:**
- [ ] `GET /orders/rating-form/:token` — public (no auth), returns `{ orderCode, customerName }`
- [ ] Validate token exists and order is delivered
- [ ] `POST /ratings` — public, body: `{ token, overall, speed, behavior, comment }`
- [ ] Validate ratings are 1–5
- [ ] After saving, set `order.ratingToken = NULL` (single-use)
- [ ] Rate-limit by IP (5 requests / hour)

**Deliverables:**
- Two public endpoints for the rating flow

**Confirmation Checkpoint:**
- Submit a rating → 201, `ratings` table has row
- Try to submit again with same token → 404 (token consumed)
- Submit rating for non-delivered order → 400
- Spam 10 requests in 1 min → 429 from rate limiter

---

## Phase 9 — Super Admin & Role Management

### Session 9.1 — User CRUD (Super Admin)

**Goal:** Super admin can create and manage operator accounts.

**Tasks:**
- [ ] `GET /users` — list all users (paginated)
- [ ] `POST /users` — create with `{ name, email, phone, password, role, categoryAccess }`
- [ ] `PATCH /users/:id` — update (including `categoryAccess`, `isActive`)
- [ ] `DELETE /users/:id` — soft delete (`isActive = false`)
- [ ] Validate `categoryAccess` is array of valid category slugs + optional `'all'`
- [ ] Hash password with bcrypt

**Deliverables:**
- Full user management for super admin

**Confirmation Checkpoint:**
- Create a user with `categoryAccess=["grocery"]`
- That user logs in → token contains `categoryAccess=["grocery"]`
- That user searches products → only grocery results
- Soft-delete the user → they can no longer log in

---

### Session 9.2 — Category Management

**Goal:** Super admin can add new categories later (e.g. "baby_care").

**Tasks:**
- [ ] `POST /categories` (super_admin)
- [ ] `PATCH /categories/:id` (super_admin)
- [ ] `DELETE /categories/:id` (super_admin) — blocked if products exist
- [ ] `GET /categories` (any authed user)

**Deliverables:**
- Category CRUD

**Confirmation Checkpoint:**
- Create category `baby_care`
- Assign to a new user
- That user can quick-add products to `baby_care`
- Try to delete `grocery` with existing products → 400

---

## Phase 10 — Security, Rate Limiting, Hardening

### Session 10.1 — Rate Limiting & Brute-Force Protection

**Goal:** Protect auth and rating endpoints.

**Tasks:**
- [ ] Install `express-rate-limit`
- [ ] `/auth/login`: 5 attempts / 15 min per IP
- [ ] `/ratings`: 5 / hour per IP
- [ ] All other `/api`: 100 / min per user
- [ ] Add `helmet` for HTTP security headers
- [ ] Add CORS allowlist (only your frontend domain in prod)

**Deliverables:**
- Rate limits active on key endpoints

**Confirmation Checkpoint:**
- 6 wrong logins in 15 min → 429
- Helmet headers present in response (`X-Content-Type-Options`, etc.)
- CORS blocks requests from `evil.com` origin

---

### Session 10.2 — Input Validation & Sanitization

**Goal:** Every endpoint validates input strictly.

**Tasks:**
- [ ] Audit all endpoints — ensure Zod schema for every request body and query
- [ ] Sanitize all string inputs (trim, lowercase emails, normalize phone numbers)
- [ ] Validate phone format (BD: `01XXXXXXXXX` or `+8801XXXXXXXXX`)
- [ ] Reject unknown fields in request bodies (`z.object(...).strict()`)

**Deliverables:**
- 100% input validation coverage

**Confirmation Checkpoint:**
- Send `{ email: 'invalid' }` to login → 400 with validation error
- Send extra unknown field to any endpoint → 400
- All phone numbers normalized to `+8801XXXXXXXXX` in DB

---

### Session 10.3 — Logging & Observability

**Goal:** Know what's happening in production.

**Tasks:**
- [ ] Use `pino` for structured JSON logging
- [ ] Log every request (method, path, status, duration, userId)
- [ ] Log every error with stack trace
- [ ] Log every status transition
- [ ] Set up log rotation (`pino-roll` or PM2 log rotation)

**Deliverables:**
- Structured logs in `./logs/` directory

**Confirmation Checkpoint:**
- Make 5 API calls → 5 log lines with correct fields
- Trigger an error → log entry includes stack trace
- Logs rotate when exceeding 10MB

---

## Phase 11 — Deployment & Go-Live

### Session 11.1 — Production Build & PM2

**Goal:** App runs in production mode, survives restarts.

**Tasks:**
- [ ] `npm run build` compiles TypeScript to `dist/`
- [ ] `npm run start` runs `node dist/server.js`
- [ ] Create `ecosystem.config.js` for PM2
- [ ] `pm2 start ecosystem.config.js --env production`
- [ ] `pm2 save && pm2 startup`

**Deliverables:**
- PM2-managed production process

**Confirmation Checkpoint:**
- `pm2 list` shows process as `online`
- Kill the process → PM2 restarts it automatically
- Server reboot → PM2 starts the app automatically

---

### Session 11.2 — Nginx Reverse Proxy + TLS

**Goal:** HTTPS endpoint on a real domain.

**Tasks:**
- [ ] Point domain DNS to VPS IP
- [ ] Create Nginx config: serve frontend static on `/`, proxy `/api` to `localhost:3000`
- [ ] `certbot --nginx -d yourdomain.com`
- [ ] Force HTTPS redirect
- [ ] Set HSTS header

**Deliverables:**
- `https://yourdomain.com/api/health` returns `{ status: 'ok' }`

**Confirmation Checkpoint:**
- HTTP requests redirect to HTTPS
- SSL Labs grade A or better
- `/api/health` reachable over HTTPS

---

### Session 11.3 — Database Backups

**Goal:** Never lose data.

**Tasks:**
- [ ] Create `/home/rizqun/backups/` directory
- [ ] Cron job: `0 2 * * * pg_dump -U rizqun_user rizqun_db | gzip > /home/rizqun/backups/$(date +\%F).sql.gz`
- [ ] Upload to offsite storage (DigitalOcean Space / S3) via `s3cmd` or `rclone`
- [ ] Keep last 30 days locally, 90 days offsite
- [ ] Test restore: `gunzip -c backup.sql.gz | psql rizqun_db`

**Deliverables:**
- Nightly backups running automatically

**Confirmation Checkpoint:**
- Backup file appears in `/home/rizqun/backups/` next morning
- Restore test succeeds on a scratch database
- Offsite copy is reachable

---

### Session 11.4 — Seed Production Data + Smoke Test

**Goal:** System is ready for real operators.

**Tasks:**
- [ ] Seed super admin with strong password (changed from default)
- [ ] Seed categories: `grocery`, `medicine`, `other`
- [ ] Import initial vendor list (CSV upload endpoint or direct SQL)
- [ ] Import product catalog (CSV — 15K medicines + 20K grocery items)
- [ ] Create first operator accounts
- [ ] Run end-to-end smoke test:
  1. Login as operator
  2. Search for a product
  3. Finalize an order
  4. View in pending list
  5. Get vendor groups + WhatsApp URL
  6. Update status through the full lifecycle
  7. View in done list
  8. Generate rating link + submit a rating
  9. View dashboard summary

**Deliverables:**
- Production system with real data and verified flow

**Confirmation Checkpoint:**
- All 9 smoke-test steps pass without errors
- Search returns results in < 100ms even with 35K products
- No errors in logs during the full flow
- Owner signs off: "✅ confirmed — go live"

---

## Master Confirmation Tracker

| Phase | Sessions | Status |
|-------|----------|--------|
| 0. Setup | 0.1, 0.2, 0.3 | ✅ |
| 1. Auth | 1.1, 1.2, 1.3 | ✅ |
| 2. Catalog | 2.1, 2.2, 2.3, 2.4, 2.5 | ✅ |
| 3. Orders | 3.1, 3.2, 3.3 | ✅ |
| 4. Status | 4.1, 4.2, 4.3 | ✅ |
| 5. WhatsApp | 5.1, 5.2 | ✅ |
| 6. Edit Pending | 6.1, 6.2, 6.3 | ✅ |
| 7. Done & Dashboard | 7.1, 7.2, 7.3 | 🔄 next |
| 8. Rating | 8.1, 8.2 | ☐ |
| 9. Super Admin | 9.1, 9.2 | ☐ |
| 10. Hardening | 10.1, 10.2, 10.3 | ☐ |
| 11. Deployment | 11.1, 11.2, 11.3, 11.4 | ☐ |

**Total: 38 sessions across 12 phases.**
**Completed: 22 / 38 sessions**

### Session Log

| Session | Commit | Summary |
|---------|--------|---------|
| 0.1 — Repo & Local Environment | `ada9f2b` | Node + TS + Express skeleton, `/health` endpoint, env config with Zod |
| 0.2 — Prisma + PostgreSQL Setup | `82a9ee7` | PG 17 (user-space), `rizqun_db`, initial `User` model, DB probe on `/health` |
| 0.3 — Linting, Formatting, Project Structure | `9915a44` | ESLint 9 flat config, Prettier, folder skeleton, code-quality docs |
| 1.1 — Full User Schema + Migration | `a0a1f1c` | `User` + `Category` models with role enum + JSONB category access, seed script (idempotent) |
| 1.2 — Auth Service (Register + Login + Refresh) | `988c3d0` | JWT auth with httpOnly refresh cookie, 5 endpoints, asyncHandler wrapper |
| 1.3 — Auth Middlewares | `3e58c1e` | `authenticate`, `requireRole`, `categoryScope` middlewares; locked down `/register` to super_admin and `/me` to authed users |
| 2.1 — Vendor + Product Schema | `6afd101` | `Vendor` + `Product` models, GIN index on `search_vector`, auto-maintained by trigger |
| 2.2 — Vendor CRUD | `dab5cb5` | 5 vendor endpoints (list/get/create/update/soft-delete), 20-test smoke script, blocks deletion if active products exist |
| 2.3 — Product CRUD | `66461b8` | 5 product endpoints (list/get/create/update/soft-delete), 21-test smoke script, validates category+vendor, trigger refresh verified |
| 2.4 — Smart Search Endpoint | `18d1364` | `GET /products/search` with FTS + ILIKE fallback + category scoping; 10-test smoke script, grocery/medicine operators properly scoped |
| 2.5 — Quick-Add Product | `8745514` | `POST /products/quick-add` for operators — auto-SKU, category-access enforced, vendor validation; 12-test smoke script |
| 3.1 — Order + OrderItem Schema | `5e9f9ed` | `Order` (status enum, orderCode, ratingToken), `OrderItem` (snapshots, denormalized vendor_id), `StatusLog` (append-only audit), `Rating` (1/order unique); cascade + uniqueness verified |
| 3.2 — Finalize Order Endpoint | `8788bbf` | `POST /orders` — batch product fetch, category-access validation, snapshots, single transaction (order + items + status_log), orderCode `ORD-YYYY-NNNNN`; 11-test smoke script, snapshot integrity confirmed |
| 3.3 — Get Order + List Orders | `719d5d6` | `GET /orders` (paginated, filtered, scoped by role) + `GET /orders/:id` (full detail, 404-not-own-leak); 13-test smoke script |
| 4.1 — Status Update + Status Log | `c9b5a58` | `PATCH /orders/:id/status` with ALLOWED_TRANSITIONS matrix, audit trail, deliveredAt; idempotent same-status, 404-not-own-leak; 13-test smoke script |
| 4.2 — Pending List Endpoint | `7a82679` | `GET /orders/pending` — only in-flight statuses, oldest-first sort, `minutesSinceCreated` field, role-scoped; 12-test smoke script |
| 4.3 — Cancel Order (Soft Delete) | `0023194` | `DELETE /orders/:id` — cancel only from editable statuses, audit log with note, 409 on locked/already-cancelled, soft-delete preserves all rows; 13-test smoke script |
| 5.1 — Vendor-wise WhatsApp Logic | `b8e8cc9` | `GET /orders/:id/vendor-groups` — items grouped by vendor, `copyText` (paste-ready multi-line) + `whatsappUrl` (wa.me deep link), `*NEW*` badge for added_after_finalize items; 12-test smoke script |
| 5.2 — Update Customer Info | `c966d1d` | `PATCH /orders/:id` — partial update (name/phone/address/deliveryFee), editable-status check, total recompute on deliveryFee change, route ordering before `/:id/status`; 19-test smoke script |
| 6.1 — Add Item to Pending Order | `5a58a13` | `POST /orders/:id/items` — `addedAfterFinalize=true` flag, editable-status check, category-access enforced, atomic transaction with totals recompute + status_log audit; 16-test smoke script |
| 6.2 — Remove Item from Pending Order | `73704aa` | `DELETE /orders/:id/items/:itemId` — editable-status check, cross-order item protection (404 if item not in order), last-item protection (409), totals recompute + audit log; 16-test smoke script |
| 6.3 — Audit Log for Edits | `02ed537` | `GET /orders/:id/audit-log` — append-only status_log entries (oldest-first) with denormalized `changedByName`; verifies `added_item`/`removed_item`/transition notes; 14-test smoke script with SQL query patterns |

After each session, paste the session's Confirmation Checkpoint back to the owner. Only after explicit "✅ confirmed" do we start the next session.
