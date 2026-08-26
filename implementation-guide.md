# Order Management System — Implementation Guide

> A lightweight, single-tenant system for receiving customer calls, building orders on the fly, splitting them vendor-wise, sending the split lists to vendors via WhatsApp, tracking order status through delivery, and reporting performance on a dashboard.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Recommended Stack & Why](#2-recommended-stack--why)
3. [Why PostgreSQL over MySQL](#3-why-postgresql-over-mysql)
4. [Architecture at a Glance](#4-architecture-at-a-glance)
5. [Database Schema](#5-database-schema)
6. [Folder Structure](#6-folder-structure)
7. [Authentication & Role-Based Access](#7-authentication--role-based-access)
8. [Core Modules](#8-core-modules)
9. [Order Status Workflow](#9-order-status-workflow)
10. [API Endpoints](#10-api-endpoints)
11. [Handling 35K Products (Big Data Tips)](#11-handling-35k-products-big-data-tips)
12. [WhatsApp Vendor-wise Copy Logic](#12-whatsapp-vendor-wise-copy-logic)
13. [Edit Pending Order (Add/Remove Items)](#13-edit-pending-order-addremove-items)
14. [Dashboard Analytics](#14-dashboard-analytics)
15. [Customer Rating Link](#15-customer-rating-link)
16. [Deployment Guide](#16-deployment-guide)
17. [Implementation Roadmap](#17-implementation-roadmap)
18. [Future Enhancements](#18-future-enhancements)

---

## 1. System Overview

### Who uses it

| Role | What they do |
|------|--------------|
| **Super Admin** | Creates new users, assigns product-category access (All / Grocery / Medicine / multi-select), manages vendors, views dashboard. |
| **User (Operator)** | Logs in, receives customer calls, searches products, builds cart, finalizes orders, splits orders vendor-wise, sends WhatsApp to vendors, updates status, sends rating link to customer. |

### What happens in a typical call

1. Customer calls.
2. Operator searches for each requested item in the smart search box.
3. Each found product is clicked → added to cart. Cart counter and total amount update live.
4. If a product is not in the catalog, the operator adds it on the fly (name + price + vendor) and adds it to cart.
5. When the customer finishes dictating, the operator clicks **Finalize** → order moves to **Pending List**.
6. Operator opens the order → sees items grouped vendor-wise → copies each vendor's sub-list → pastes into WhatsApp → sends to vendor.
7. Operator updates status step by step: Pending → Waiting for Vendor → Preparing → Picked Up → Delivered.
8. Until "Picked Up", the customer can call back and the operator can add/remove items.
9. On "Delivered", order leaves Pending list and goes to **Done List**.
10. Dashboard shows monthly done count, average time per order, average time per step.
11. Operator sends the customer a unique rating link.

---

## 2. Recommended Stack & Why

| Layer | Choice | Reason |
|-------|--------|--------|
| **Runtime** | Node.js 20 LTS | Lightweight, fast I/O, huge ecosystem. |
| **Framework** | Express.js | Minimal, no magic, easy to maintain years later. |
| **ORM** | Prisma | Type-safe schema, auto-migration, excellent PostgreSQL support, easy to read for non-experts. |
| **Database** | PostgreSQL 15+ | See next section. |
| **Auth** | JWT (short-lived) + refresh token in httpOnly cookie | Stateless, simple, no session table. |
| **Validation** | Zod | Schema validation shared between FE and BE. |
| **Frontend** | React (Vite) + Tailwind + shadcn/ui | Clean, smart UI. Optional — frontend is independent. |
| **Search** | PostgreSQL full-text search (`tsvector`) | Handles 35K products easily without extra services. Optional upgrade to Meilisearch later. |
| **WhatsApp** | `wa.me` deep links + clipboard copy | No API cost, no business verification needed. |
| **Hosting** | Single VPS (2 vCPU / 4 GB RAM) | Sufficient for this scale. |

> **Why not Laravel?** Laravel is great, but for this scope (one operator team, REST + WebSocket optional) Node.js keeps the codebase in one language (JS/TS) end-to-end, the deployment surface smaller, and the cold start faster. If your team is more comfortable with PHP, Laravel + MySQL is an equally valid choice — the schema and modules below apply identically.

---

## 3. Why PostgreSQL over MySQL

| Need | PostgreSQL | MySQL |
|------|------------|-------|
| Full-text search on 35K products | `tsvector` + GIN index, ranked results | `FULLTEXT` index, less flexible ranking |
| JSON columns (for `category_access` array, cart snapshot) | `JSONB` — indexable, queryable | `JSON` — limited indexing |
| Partial / expression indexes | Yes (e.g. index only `status='pending'`) | Limited |
| Strictness | Strict types, catches app bugs early | Looser (silent truncation etc.) |
| Analytics queries (window functions, CTEs) | Mature, fast | Available but less optimized |

**Verdict:** PostgreSQL. The 35K-product search + JSONB-based role scoping + dashboard analytics are all cleaner on Postgres.

---

## 4. Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────┐
│                       Browser (React UI)                    │
│  Login · Search · Cart · Pending List · Order Modal · Done   │
└────────────────────────────┬────────────────────────────────┘
                             │ REST + JWT
┌────────────────────────────▼────────────────────────────────┐
│                  Node.js + Express API                       │
│  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌────────┐ ┌────────┐ │
│  │  Auth   │ │Catalog  │ │  Orders  │ │Vendors │ │Dashboard│ │
│  │Middleware│ │ Module  │ │  Module  │ │ Module │ │ Module │ │
│  └─────────┘ └─────────┘ └──────────┘ └────────┘ └────────┘ │
└────────────────────────────┬────────────────────────────────┘
                             │ Prisma
              ┌──────────────▼──────────────┐
              │      PostgreSQL 15           │
              │  (users, products, vendors, │
              │   orders, order_items,       │
              │   ratings, status_log)       │
              └─────────────────────────────┘

External:
  - WhatsApp via wa.me deep links (no API integration needed)
  - Rating link via unique token URL
```

---

## 5. Database Schema

### ER Diagram (Mermaid)

```mermaid
erDiagram
  USERS ||--o{ ORDERS : places
  USERS }o--o{ CATEGORIES : has_access_to
  PRODUCTS ||--o{ ORDER_ITEMS : in
  VENDORS ||--o{ PRODUCTS : supplies
  VENDORS ||--o{ ORDER_ITEMS : fulfills
  ORDERS ||--|{ ORDER_ITEMS : contains
  ORDERS ||--o{ STATUS_LOG : transitions
  ORDERS ||--o| RATINGS : receives
  CATEGORIES ||--o{ PRODUCTS : belongs_to

  USERS {
    bigint id PK
    string name
    string phone
    string email UK
    string password_hash
    string role "super_admin | user"
    jsonb category_access "['all'] or ['grocery','medicine']"
    boolean is_active
    timestamp created_at
  }

  CATEGORIES {
    bigint id PK
    string slug UK "grocery | medicine"
    string name
  }

  VENDORS {
    bigint id PK
    string name
    string phone
    string category "grocery | medicine | other"
    string whatsapp_number
    boolean is_active
    timestamp created_at
  }

  PRODUCTS {
    bigint id PK
    string name
    string sku UK
    numeric price
    bigint category_id FK
    bigint vendor_id FK
    string unit "pcs | kg | box"
    tsvector search_vector "generated column"
    boolean is_active
    timestamp created_at
    timestamp updated_at
  }

  ORDERS {
    bigint id PK
    string order_code UK "ORD-2026-0001"
    bigint user_id FK
    string customer_name
    string customer_phone
    string customer_address
    numeric subtotal
    numeric delivery_fee
    numeric total
    string status "pending | waiting_vendor | preparing | picked_up | delivered | cancelled"
    string rating_token UK
    timestamp created_at
    timestamp delivered_at
  }

  ORDER_ITEMS {
    bigint id PK
    bigint order_id FK
    bigint product_id FK "nullable, if product was added on-the-fly"
    bigint vendor_id FK "denormalized for easy grouping"
    string product_name_snapshot "in case product changes later"
    numeric price_snapshot
    numeric qty
    numeric line_total
    boolean added_after_finalize "true if added during pending edit"
    timestamp added_at
  }

  STATUS_LOG {
    bigint id PK
    bigint order_id FK
    string from_status
    string to_status
    bigint changed_by FK "users.id"
    timestamp changed_at
  }

  RATINGS {
    bigint id PK
    bigint order_id FK
    int overall "1-5"
    int speed
    int behavior
    text comment
    timestamp submitted_at
  }
```

### Key schema notes

- **`category_access` on `users`**: stored as `JSONB` array. Values: `["all"]` OR `["grocery", "medicine"]`. Used to filter products and orders at query time.
- **`search_vector` on `products`**: PostgreSQL generated column fed by `to_tsvector('english', name)`. Maintained automatically; no triggers needed.
- **`order_items.product_name_snapshot` & `price_snapshot`**: order history never breaks even if product is later renamed or repriced.
- **`order_items.vendor_id`**: denormalized intentionally — needed for the WhatsApp "group by vendor" feature without joining products.
- **`order_items.added_after_finalize`**: marks items added after the order was placed, so the UI can show "added later" badges and the operator can highlight them to the vendor.
- **`status_log`**: every status change is appended (not updated). This is what powers the dashboard's "time per step" metric.
- **`rating_token`**: a random unguessable string used in the public rating URL.

---

## 6. Folder Structure

```
order-system/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts                 # seed admin user + sample categories
├── src/
│   ├── config/
│   │   ├── env.ts              # dotenv + validation
│   │   └── prisma.ts           # Prisma client singleton
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.routes.ts
│   │   │   ├── auth.controller.ts
│   │   │   └── auth.service.ts
│   │   ├── users/              # super-admin only
│   │   ├── products/
│   │   ├── vendors/
│   │   ├── orders/
│   │   │   ├── orders.routes.ts
│   │   │   ├── orders.controller.ts
│   │   │   ├── orders.service.ts
│   │   │   └── orders.dto.ts
│   │   ├── dashboard/
│   │   └── ratings/
│   ├── middlewares/
│   │   ├── auth.middleware.ts   # JWT verification
│   │   ├── role.middleware.ts   # super_admin check
│   │   └── category-scope.middleware.ts  # filters products by user.category_access
│   ├── utils/
│   │   ├── jwt.ts
│   │   ├── whatsapp.ts          # builds wa.me links + clipboard text
│   │   └── response.ts        # standard JSON envelope
│   ├── app.ts
│   └── server.ts
├── .env
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

> Each module is self-contained (`routes` → `controller` → `service` → `prisma`). To add a new module, copy the structure. No global state. Easy to hand over to anyone in the future.

---

## 7. Authentication & Role-Based Access

### Two roles only

| Role | Can do |
|------|--------|
| `super_admin` | Everything + create users + assign category access + manage vendors + manage categories |
| `user` | Search products (within assigned categories), manage their own orders, update order status, send WhatsApp, send rating link |

### Category scoping for users

When the super admin creates a user, they multi-select from:

- `all`
- `grocery`
- `medicine`

The selected list is stored in `users.category_access` as `JSONB`.

At query time, every product/order query is wrapped like this (pseudo-code, no real code in this doc):

```
WHERE
  category_access @> '["all"]'::jsonb
  OR EXISTS (
    SELECT 1 FROM products p
    JOIN categories c ON c.id = p.category_id
    WHERE p.id = <product_id> AND c.slug = ANY(category_access::text[])
  )
```

So a user with `["grocery"]` literally never sees medicine products in search results, in cart, or in pending orders that contain only medicine.

### Auth flow

1. `POST /auth/login` → returns `{ accessToken, refreshToken }`. Access token TTL = 15 min, refresh TTL = 7 days, refresh stored in `httpOnly` cookie.
2. Every protected route passes through `auth.middleware` → verifies access token → injects `req.user`.
3. `category-scope.middleware` reads `req.user.category_access` and adds a Prisma `where` clause to product/order queries.
4. `role.middleware` (`requireRole('super_admin')`) protects `/users`, `/vendors`, `/categories` admin routes.

---

## 8. Core Modules

### 8.1 Smart Search Box

- Frontend: a debounced input (250ms) calling `GET /products?q=paracetamol&limit=20`.
- Backend: PostgreSQL full-text search on `products.search_vector` using `tsquery`, ranked by `ts_rank`, with a fallback `ILIKE '%term%'` if no results.
- Returns: `{ id, name, price, unit, vendor_name, category }` so the UI can render each result card in one row.
- Result: typing "para" returns Paracetamol 500mg, Paracetamol Syrup, etc., within ~50ms even across 35K rows (because of the GIN index).

### 8.2 Cart (frontend-only state until finalize)

- The cart is **not persisted** during the active call — it lives in React state (or `localStorage` for crash recovery).
- Each item: `{ product_id, name, price, qty, vendor_id, vendor_name, category, is_custom }`.
- `is_custom: true` for items added on the fly (no `product_id`).
- Header shows live counter + total amount.

### 8.3 Quick Add (custom product on the fly)

When the customer asks for an item not in catalog, operator clicks **"+ Add Custom"**:

- A small inline form: `name`, `price`, `qty`, `vendor` (select existing or create new).
- On submit:
  - `POST /products` creates a real product entry (so it's searchable next time).
  - The new product is immediately pushed to cart.
- This way the catalog grows organically as the team learns what customers actually ask for.

### 8.4 Finalize Order

`POST /orders` with:

```
{
  customer_name, customer_phone, customer_address,
  delivery_fee,
  items: [{ product_id, qty, vendor_id }]
}
```

Backend:

1. Validates each item against `user.category_access`.
2. Snapshots `name` and `price` into `order_items` for historical integrity.
3. Computes `subtotal`, `total`.
4. Inserts row in `ORDERS` with `status='pending'`, generates `order_code` (`ORD-YYYY-NNNNN`).
5. Inserts first row in `STATUS_LOG` (`from_status=NULL, to_status='pending'`).
6. Returns the created order (with `id` and `order_code`).

Frontend clears the cart.

### 8.5 Pending List

`GET /orders?status=pending&page=1`

Returns a paginated list with columns:

| Order Code | Customer | Items | Total | Created | Status | Actions |
|---|---|---|---|---|---|---|
| ORD-2026-0042 | Rahim | 7 | 1,250 BDT | 2h ago | Preparing | [View] [Status ▾] [Delete] |

- **Status** dropdown: inline update via `PATCH /orders/:id/status`.
- **View**: opens the order modal (see 8.6).
- **Delete**: soft-delete (sets `status='cancelled'`, never physically removed) — preserves audit trail.

### 8.6 Order View Modal

Layout:

```
┌────────────────────────────────────────────────────────────┐
│ Order ORD-2026-0042        Status: Preparing      [×]      │
├────────────────────────────────────────────────────────────┤
│ Customer Info                                              │
│   Name:  [ Rahim Uddin           ]   Phone: [ 017XXXXXXXX  ]│
│                                                            │
│ Items by Vendor                                            │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ Vendor: Hashem Grocery  · 017XXXXXXXX  [Copy] [WhatsApp]│ │
│ │  1. Rice (Basmati) — 5 kg × 120 = 600                  │ │
│ │  2. Sugar — 2 kg × 95 = 190                            │ │
│ │  Subtotal: 790                                          │ │
│ └────────────────────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ Vendor: City Pharma · 019XXXXXXXX  [Copy] [WhatsApp]    │ │
│ │  3. Paracetamol 500mg — 2 × 10 = 20                    │ │
│ │  4. Antacid Syrup — 1 × 80 = 80                        │ │
│ │  Subtotal: 100                                          │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                            │
│ [+ Add Item]  [Remove Item]   Total: 890 + Delivery: 50    │
│                                                            │
│ [Update Status ▾]   [Send Rating Link]   [Close]           │
└────────────────────────────────────────────────────────────┘
```

Key behaviors:

- Customer name and phone are inline-editable (saved on blur).
- Items grouped by vendor — each vendor block shows its subtotal and has a Copy + WhatsApp button.
- "+ Add Item" opens the same search box used during the call.
- "Remove Item" lets the operator delete any line item.
- All of this works **only while `status` is `pending`, `waiting_vendor`, or `preparing`** — i.e. before `picked_up`.

### 8.7 Done List

`GET /orders?status=delivered&page=1`

Same table UI as pending, but with a "Delivered At" column and no status dropdown — only [View] and [Delete]. Also exposes a filter by month for reporting.

---

## 9. Order Status Workflow

```mermaid
flowchart LR
  A[pending] -->|vendor contacted| B[waiting_vendor]
  B -->|vendor confirms| C[preparing]
  C -->|delivery man picks up| D[picked_up]
  D -->|delivered to customer| E[delivered]
  A -->|customer cancels| F[cancelled]
  B -->|customer cancels| F
  C -->|customer cancels| F
```

### Status semantics

| Status | Meaning | Editable? |
|--------|---------|-----------|
| `pending` | Just placed, not yet contacted vendor | Yes |
| `waiting_vendor` | Vendor contacted, waiting confirmation | Yes |
| `preparing` | Vendor is preparing the items | Yes |
| `picked_up` | Delivery man has collected the items | **No** — locked |
| `delivered` | Handed to customer | No |
| `cancelled` | Voided | No |

### Enforcement rule

The backend enforces: **if `status IN ('picked_up','delivered','cancelled')`, then add/remove item endpoints return `409 Conflict`.** This protects the rule "customer can add/remove only until pickup".

Every transition is recorded in `STATUS_LOG` with `from_status`, `to_status`, `changed_by`, `changed_at` — this powers the dashboard step-time metric.

---

## 10. API Endpoints

### Auth

| Method | Path | Body | Role |
|--------|------|------|------|
| POST | `/auth/login` | `{ email, password }` | public |
| POST | `/auth/refresh` | (cookie) | public |
| POST | `/auth/logout` | — | any |

### Users (super admin)

| Method | Path | Body |
|--------|------|------|
| GET | `/users` | — |
| POST | `/users` | `{ name, email, phone, password, role, category_access }` |
| PATCH | `/users/:id` | partial |
| DELETE | `/users/:id` | soft |

### Categories

| Method | Path | Role |
|--------|------|-----|
| GET | `/categories` | any |
| POST/PATCH/DELETE | `/categories` | super_admin |

### Products

| Method | Path | Notes |
|--------|------|-------|
| GET | `/products?q=&category=&page=` | scoped by `category_access` |
| POST | `/products` | quick-add; user role allowed only within their categories |
| PATCH | `/products/:id` | super_admin or same-category user |
| DELETE | `/products/:id` | soft |

### Vendors

| Method | Path | Role |
|--------|------|-----|
| GET | `/vendors` | any |
| POST/PATCH/DELETE | `/vendors` | super_admin |

### Orders

| Method | Path | Notes |
|--------|------|-------|
| GET | `/orders?status=&page=&from=&to=` | scoped |
| POST | `/orders` | finalize cart |
| GET | `/orders/:id` | full detail with grouped items |
| PATCH | `/orders/:id` | update customer info |
| PATCH | `/orders/:id/status` | `{ status }` |
| POST | `/orders/:id/items` | add item (only if editable) |
| DELETE | `/orders/:id/items/:itemId` | remove item (only if editable) |
| DELETE | `/orders/:id` | cancel order |
| GET | `/orders/:id/vendor-groups` | returns items grouped by vendor + wa.me link per vendor |

### Dashboard

| Method | Path | Returns |
|--------|------|---------|
| GET | `/dashboard/summary?month=` | done count, avg total time, avg step time |
| GET | `/dashboard/step-breakdown` | avg ms per status transition |

### Ratings

| Method | Path | Notes |
|--------|------|-------|
| POST | `/ratings` | public, body: `{ token, overall, speed, behavior, comment }` |
| GET | `/orders/rating-form/:token` | public, returns order info for the form |
| POST | `/orders/:id/rating-link` | generates link, returns URL |

---

## 11. Handling 35K Products (Big Data Tips)

35K products is not "big data" in the Hadoop sense, but it is big enough that naive queries (`SELECT * FROM products WHERE name LIKE '%par%'`) will feel slow on shared hosting. Here's how to keep it fast.

### 11.1 Indexing strategy

- `CREATE INDEX products_search_idx ON products USING GIN (search_vector);` — for full-text search.
- `CREATE INDEX products_category_idx ON products (category_id);` — for category filter.
- `CREATE INDEX products_active_idx ON products (is_active) WHERE is_active = true;` — partial index, smaller and faster.
- `CREATE INDEX products_sku_idx ON products (sku);` — for exact SKU lookup.
- `CREATE INDEX vendors_category_idx ON vendors (category);`

### 11.2 Search strategy

Primary: PostgreSQL full-text search (`tsvector` + `tsquery` + GIN index).

```
SELECT id, name, price, unit, vendor_name
FROM products, to_tsquery('paracet & 500') q
WHERE search_vector @@ q
  AND is_active = true
ORDER BY ts_rank(search_vector, q) DESC
LIMIT 20;
```

Fallback: if FTS returns fewer than 5 results, run an `ILIKE '%term%'` query and merge.

If in the future search becomes slow (>100ms consistently), drop in **Meilisearch** as a sidecar — it's a single binary, ~30MB, indexes 35K rows in seconds, and supports typo-tolerance out of the box.

### 11.3 Pagination

All list endpoints use cursor-based pagination (`?after=ID&limit=20`), not offset. Cursor pagination stays fast even on deep pages because it doesn't need to count skipped rows.

### 11.4 Read replicas (future)

At this scale, a single Postgres instance handles everything. If the dashboard analytics queries start slowing down the OLTP queries, add a read replica and route dashboard reads there.

---

## 12. WhatsApp Vendor-wise Copy Logic

### The problem

An order has 10 items: 5 from vendor X, 5 from vendor Y. The operator needs to send vendor X a WhatsApp message listing only X's items, and vendor Y a separate message listing only Y's items. No API call — just copy + paste into WhatsApp.

### The flow

1. Operator opens order modal.
2. Backend `GET /orders/:id/vendor-groups` returns:

```
{
  "groups": [
    {
      "vendor_id": 12,
      "vendor_name": "Hashem Grocery",
      "vendor_phone": "017XXXXXXXX",
      "whatsapp_number": "88017XXXXXXXX",   // E.164, no +
      "items": [
        { "name": "Rice (Basmati)", "qty": 5, "unit": "kg" },
        { "name": "Sugar", "qty": 2, "unit": "kg" }
      ],
      "subtotal": 790,
      "copy_text": "Order ORD-2026-0042\nHashem Grocery\n1. Rice (Basmati) - 5 kg\n2. Sugar - 2 kg\nTotal: 790 BDT\nCustomer: Rahim - 017XXXXXXXX\nAddress: ...",
      "whatsapp_url": "https://wa.me/88017XXXXXXXX?text=Order%20ORD-2026-0042%0A..."
    },
    {
      "vendor_id": 34,
      "vendor_name": "City Pharma",
      ...
    }
  ]
}
```

3. Each vendor block in the modal shows two buttons:
   - **Copy** → writes `copy_text` to clipboard via `navigator.clipboard.writeText()`.
   - **WhatsApp** → opens `whatsapp_url` in a new tab. WhatsApp Web or the WhatsApp app opens with the message pre-filled; operator just clicks Send.

### The `copy_text` template

```
Order: ORD-2026-0042
Vendor: Hashem Grocery
Customer: Rahim Uddin
Phone: 017XXXXXXXX
Address: House 12, Road 5, Dhanmondi

Items:
1. Rice (Basmati) — 5 kg
2. Sugar — 2 kg

Total: 790 BDT
Please confirm availability. Thank you.
```

### New items added after finalize

Items added via "Add Item" while the order is pending get a marker in the copy text:

```
3. *NEW* Lentils (Masoor) — 1 kg
```

This tells the vendor "this is an addition to the previous list, please include it too".

### Why `wa.me` instead of WhatsApp Business API

- No API cost.
- No business verification.
- No message template approval.
- The operator can edit the message before sending if needed.
- Limitation: cannot send programmatically — operator must click Send. Acceptable for this use case.

---

## 13. Edit Pending Order (Add/Remove Items)

### Allowed window

```
allowed_editable_statuses = ['pending', 'waiting_vendor', 'preparing']
```

### Add item flow

1. Operator opens order modal → clicks **+ Add Item**.
2. Same search box appears (scoped to user's category access).
3. Operator picks a product → enters qty → confirms.
4. `POST /orders/:id/items` with `{ product_id, qty }`.
5. Backend:
   - Checks `order.status` is in `allowed_editable_statuses`. If not → `409`.
   - Re-validates product against user's `category_access`.
   - Inserts new `order_items` row with `added_after_finalize=true`.
   - Recomputes `order.total`.
   - Returns the updated order.
6. Frontend refreshes the modal — new item appears in the appropriate vendor group, marked "NEW".

### Remove item flow

1. Each line item has a small trash icon (visible only when editable).
2. Click → confirm → `DELETE /orders/:id/items/:itemId`.
3. Backend:
   - Checks editable status.
   - Deletes the `order_items` row.
   - Recomputes `order.total`.
   - Returns updated order.

### Audit

Every add/remove action writes to `STATUS_LOG` with `from_status = current_status, to_status = current_status` and a special `note` field (`'added_item'` / `'removed_item'`). This way the dashboard can show "how often are orders edited mid-flight".

---

## 14. Dashboard Analytics

### 14.1 Monthly summary

`GET /dashboard/summary?month=2026-08`

Returns:

```
{
  "month": "2026-08",
  "done_count": 342,
  "avg_total_minutes": 47.3,
  "avg_step_minutes": {
    "pending_to_waiting": 3.2,
    "waiting_to_preparing": 18.5,
    "preparing_to_picked_up": 21.0,
    "picked_up_to_delivered": 4.6
  }
}
```

### 14.2 Underlying queries (pseudo)

**Done count for month:**

```sql
SELECT COUNT(*) FROM orders
WHERE status = 'delivered'
  AND delivered_at >= '2026-08-01'
  AND delivered_at < '2026-09-01';
```

**Average total time:**

```sql
SELECT AVG(EXTRACT(EPOCH FROM (delivered_at - created_at)) / 60) AS avg_minutes
FROM orders
WHERE status = 'delivered'
  AND delivered_at >= '2026-08-01';
```

**Average time per step** (using `STATUS_LOG`):

```sql
WITH transitions AS (
  SELECT
    order_id,
    to_status,
    changed_at,
    LAG(changed_at) OVER (PARTITION BY order_id ORDER BY changed_at) AS prev_at
  FROM status_log
  WHERE order_id IN (SELECT id FROM orders WHERE delivered_at >= '2026-08-01')
)
SELECT
  to_status,
  AVG(EXTRACT(EPOCH FROM (changed_at - prev_at)) / 60) AS avg_minutes
FROM transitions
WHERE prev_at IS NOT NULL
GROUP BY to_status;
```

### 14.3 Dashboard charts (frontend)

- Bar chart: orders done per day (last 30 days).
- Line chart: avg total time per day.
- Horizontal bar: avg minutes per status step.
- Donut: orders by category (grocery vs medicine).

All powered by the same `dashboard` endpoints; the frontend is dumb.

---

## 15. Customer Rating Link

### Generation

When the operator clicks **Send Rating Link** on a delivered order:

1. `POST /orders/:id/rating-link` generates a random 32-char token (`crypto.randomBytes(16).toString('hex')`).
2. Token saved in `orders.rating_token`.
3. Returns URL: `https://yourapp.com/rate/{token}`.
4. Operator copies and sends to customer via WhatsApp/SMS.

### Public rating form

`GET /orders/rating-form/:token` (no auth) returns:

```
{ "order_code": "ORD-2026-0042", "customer_name": "Rahim U." }
```

Frontend renders a simple form: 3 star ratings (overall / speed / behavior) + optional comment.

`POST /ratings` (no auth, body includes `token`) saves the rating linked to the order. Once submitted, `rating_token` is set to NULL so the link can't be reused.

### Security

- Token is unguessable (128 bits of entropy).
- Each token works exactly once.
- Token has no auth requirement — customers don't have accounts.
- Rate-limit by IP (`express-rate-limit`) to prevent spam.

---

## 16. Deployment Guide

### 16.1 Target environment

- **Single VPS** — 2 vCPU / 4 GB RAM / 40 GB SSD (DigitalOcean / Vultr / Hostinger ~6 USD/month).
- **OS**: Ubuntu 22.04 LTS.
- **Process manager**: PM2.
- **Reverse proxy**: Nginx (terminates TLS, serves frontend static build, proxies `/api` to Node).
- **TLS**: Let's Encrypt via `certbot`.
- **Database**: PostgreSQL installed locally on the same VPS (sufficient for this scale).
- **Backups**: `pg_dump` nightly cron to a DigitalOcean Space / S3.

### 16.2 Setup steps (high-level)

1. Provision VPS, SSH in.
2. `apt update && apt install -y nodejs npm postgresql nginx`.
3. Install PM2: `npm i -g pm2`.
4. Clone repo, `npm ci`, build TypeScript.
5. Create Postgres user + database, set `DATABASE_URL` in `.env`.
6. `npx prisma migrate deploy && npx prisma db seed`.
7. `pm2 start dist/server.js --name order-api`.
8. `pm2 save && pm2 startup` (auto-restart on reboot).
9. Configure Nginx: serve `/var/www/order-ui` for `/`, proxy `/api` to `localhost:3000`.
10. `certbot --nginx -d yourapp.com`.
11. Set up cron: `0 2 * * * pg_dump -U order_user order_db | gzip > /backups/$(date +\%F).sql.gz`.

### 16.3 Environment variables (`.env.example`)

```
DATABASE_URL=postgresql://order_user:strong_password@localhost:5432/order_db
JWT_ACCESS_SECRET=<64-char-random>
JWT_REFRESH_SECRET=<64-char-random>
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d
APP_BASE_URL=https://yourapp.com
PORT=3000
NODE_ENV=production
```

### 16.4 Scaling notes (when you outgrow the VPS)

- **Read-heavy**: add a Postgres read replica, route dashboard reads to it.
- **Search-heavy**: introduce Meilisearch as a sidecar, sync via Prisma event listener.
- **Multi-region**: not needed for a single-team operator workflow.
- **Multi-tenant**: if you franchise the system, add a `tenant_id` column on every table and a `tenants` table — but that's a future project.

---

## 17. Implementation Roadmap

A realistic 6-week build for one developer.

| Week | Deliverable |
|------|-------------|
| 1 | Repo setup, Prisma schema + migrations, auth (login/JWT/refresh), user CRUD, category access middleware. |
| 2 | Product CRUD, vendor CRUD, search endpoint with FTS, quick-add product flow. |
| 3 | Cart UI, finalize order endpoint, pending list UI, order view modal with vendor grouping. |
| 4 | WhatsApp copy + wa.me link logic, status workflow, status log, edit pending order (add/remove items). |
| 5 | Done list, dashboard endpoints + UI, rating link generation + public form. |
| 6 | Polish, role-based UI gates, rate limiting, backups, deployment, seed data, UAT. |

---

## 18. Future Enhancements

- **WebSocket / SSE** — push new pending orders to all operators live.
- **Inventory sync** — vendor confirms availability via a simple WhatsApp-reply webhook.
- **Auto-suggest items** — "customers who ordered X also ordered Y".
- **Delivery man app** — a separate lightweight login where the delivery person marks items as picked up / delivered without bothering the operator.
- **Multi-currency / tax** — if expanding internationally.
- **Voice-to-text** — operator dictates the customer's request instead of typing.
- **PDF invoice** — generate a PDF invoice per order, send to customer.
- **Vendor portal** — vendors log in and see their incoming orders without WhatsApp.

---

## Appendix A — Status codes used by the system

| Code | Label (UI) | Internal value |
|------|------------|----------------|
| 1 | Pending | `pending` |
| 2 | Waiting for Vendor | `waiting_vendor` |
| 3 | Preparing the Order | `preparing` |
| 4 | Delivery Man Picked Up | `picked_up` |
| 5 | Delivery Done | `delivered` |
| 0 | Cancelled | `cancelled` |

## Appendix B — Glossary

| Term | Meaning |
|------|---------|
| **Operator** | The user (employee) who takes the call and builds the order. |
| **Vendor** | The supplier (grocery shop, pharmacy) from whom items are collected. |
| **Customer** | The end person who called and will receive the delivery. |
| **Finalize** | Action of converting the active cart into a saved order. |
| **Pending List** | List of orders not yet delivered. |
| **Done List** | Archive of delivered orders. |
| **Status Log** | Append-only table tracking every status transition with timestamps. |
| **Rating Token** | A single-use, unguessable URL token that lets a customer rate an order without logging in. |
