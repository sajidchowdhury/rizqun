# Rizqun Frontend — Phase-by-Phase Implementation Plan

> A complete, browser-ready operator console for the Rizqun order management API.
> Built on top of the existing, feature-complete backend at `sajidchowdhury/rizqun` (38/38 backend sessions done).

---

## 0. Read Me First

### 0.1 What this document is

This is the **frontend companion** to the backend `implementation-plan.md`.
The backend is 100% complete; this plan defines how to build the **frontend** from an empty
folder to a fully working browser application, phase by phase, session by session.

Every phase ends with a deployable increment. The final phase ends with a complete
browser app that an operator can use to log in, take customer calls, build orders,
send WhatsApp splits to vendors, track delivery, view dashboard analytics, and rate
orders — all backed by the existing Rizqun API.

### 0.2 Tech stack (per backend `implementation-guide.md:65`)

| Layer | Choice | Why |
|-------|--------|----|
| Framework | **React 18** | Matches the backend's documented choice |
| Build tool | **Vite 5** | Fast HMR, simple config, ESM-native |
| Language | **TypeScript 5** | Same as backend; shared Zod schemas possible |
| Styling | **Tailwind CSS v4** | Matches docs |
| Components | **shadcn/ui** (Radix + Tailwind) | Matches docs |
| Routing | **React Router v6** | Nginx SPA fallback already configured for it |
| Data fetching | **TanStack React Query v5** | Caching, invalidation, optimistic updates |
| HTTP client | **axios** | Interceptors for token attach + 401 refresh |
| Forms | **react-hook-form + zod** | Same zod as backend, shared validation rules |
| State (UI) | **zustand** | Lightweight cart state across pages |
| Charts | **recharts** | React-native, Tailwind-friendly, fits shadcn |
| Dates | **date-fns** | Tree-shakeable, UTC-safe |
| Icons | **lucide-react** | Pairs with shadcn/ui |
| Toasts | **sonner** | shadcn/ui default |

### 0.3 Pre-requisites (already met if you ran the backend locally)

- Node.js ≥ 20
- npm ≥ 10
- The Rizqun backend running on `http://localhost:3000` (38/38 backend sessions complete)
- PostgreSQL running on `127.0.0.1:5432` with seeded data (run `npx prisma db seed` if not done)
- A code editor (VS Code recommended with the official Tailwind + ESLint extensions)

### 0.4 Repository strategy

The frontend lives in a **separate repository** (per backend `implementation-guide.md:65`:
"frontend is independent"). Suggested name: **`rizqun-ui`** (matches the Nginx deployment
path `/var/www/rizqun-ui` in `deploy/nginx/rizqun.conf`).

```bash
# New repo (do this in Phase 0.1)
mkdir rizqun-ui && cd rizqun-ui
git init
```

### 0.5 Backend API contract (what we consume)

The backend exposes these route groups — all under `http://localhost:3000`:

| Route | Auth | Purpose |
|-------|------|---------|
| `POST /auth/login` | public | Login → access token + refresh cookie |
| `POST /auth/refresh` | refresh cookie | Rotate tokens |
| `POST /auth/logout` | public | Clear refresh cookie |
| `POST /auth/register` | super_admin | Create operator |
| `GET  /auth/me` | bearer | Current user + category scope |
| `GET    /vendors` | bearer | List (paginated) |
| `POST   /vendors` | super_admin | Create |
| `PATCH  /vendors/:id` | super_admin | Update |
| `DELETE /vendors/:id` | super_admin | Deactivate |
| `GET    /products` | bearer | List (paginated) |
| `GET    /products/search?q=` | bearer | Full-text search (Postgres tsvector) |
| `POST   /products` | super_admin | Create |
| `PATCH  /products/:id` | super_admin | Update |
| `DELETE /products/:id` | super_admin | Deactivate |
| `POST   /orders` | bearer | Finalize cart → order |
| `GET    /orders` | bearer | Paginated list (scoped by role) |
| `GET    /orders/pending` | bearer | In-flight orders |
| `GET    /orders/done` | bearer | Delivered orders (month filter, search) |
| `GET    /orders/:id` | bearer | Order detail |
| `PATCH  /orders/:id` | bearer | Update customer info / delivery fee |
| `PATCH  /orders/:id/status` | bearer | Status transition |
| `DELETE /orders/:id` | bearer | Cancel (soft) |
| `POST   /orders/:id/items` | bearer | Add item mid-flight |
| `DELETE /orders/:id/items/:itemId` | bearer | Remove item mid-flight |
| `GET    /orders/:id/vendor-groups` | bearer | Items grouped by vendor + WhatsApp copy text |
| `GET    /orders/:id/audit-log` | bearer | Status history |
| `POST   /orders/:id/rating-link` | bearer | Generate rating token |
| `GET    /orders/rating-form/:token` | public | Rating form data |
| `POST   /ratings` | public | Submit rating |
| `GET    /categories` | bearer | List |
| `POST   /categories` | super_admin | Create |
| `PATCH  /categories/:id` | super_admin | Update |
| `DELETE /categories/:id` | super_admin | Delete |
| `GET    /users` | super_admin | List users |
| `POST   /users` | super_admin | Create |
| `PATCH  /users/:id` | super_admin | Update |
| `DELETE /users/:id` | super_admin | Deactivate |
| `GET    /dashboard/summary?month=YYYY-MM` | bearer | done count, avg total + step minutes |
| `GET    /dashboard/orders-per-day?days=N` | bearer | Bar chart data |
| `GET    /dashboard/avg-time-per-day?days=N` | bearer | Line chart data |
| `GET    /dashboard/category-breakdown?month=YYYY-MM` | bearer | Donut chart data |
| `GET    /health` | public | Health probe |

### 0.6 Response envelope

Every authenticated API response follows:

```ts
{ success: true,  message: string, data: T }
{ success: false, message: string, code?: string }   // errors
```

### 0.7 Auth model

- Access token: 15-min TTL, sent in `Authorization: Bearer <token>`
- Refresh token: 7-day TTL, in `HttpOnly SameSite=Strict` cookie named `rizqun_refresh`
- Frontend must call `POST /auth/refresh` when access token expires (axios interceptor)
- Logout clears the refresh cookie

### 0.8 Project folder layout (target)

```
rizqun-ui/
├─ src/
│  ├─ main.tsx               # entry
│  ├─ App.tsx                # router + providers
│  ├─ index.css              # Tailwind + shadcn theme tokens
│  ├─ lib/
│  │  ├─ api.ts              # axios instance + interceptors
│  │  ├─ query-client.ts     # React Query client
│  │  ├─ utils.ts            # cn() helper (clsx + tailwind-merge)
│  │  └─ env.ts              # VITE_API_BASE_URL etc.
│  ├─ types/
│  │  ├─ api.ts              # API response types
│  │  ├─ user.ts
│  │  ├─ order.ts
│  │  ├─ product.ts
│  │  ├─ vendor.ts
│  │  ├─ category.ts
│  │  ├─ dashboard.ts
│  │  └─ rating.ts
│  ├─ schemas/               # zod schemas (mirror backend *.dto.ts)
│  │  ├─ auth.ts
│  │  ├─ order.ts
│  │  ├─ product.ts
│  │  ├─ vendor.ts
│  │  ├─ category.ts
│  │  ├─ user.ts
│  │  └─ rating.ts
│  ├─ hooks/
│  │  ├─ use-auth.ts
│  │  ├─ use-cart.ts
│  │  ├─ use-products.ts
│  │  ├─ use-orders.ts
│  │  ├─ use-vendors.ts
│  │  ├─ use-categories.ts
│  │  ├─ use-users.ts
│  │  ├─ use-dashboard.ts
│  │  └─ use-ratings.ts
│  ├─ contexts/
│  │  ├─ auth-provider.tsx
│  │  └─ cart-provider.tsx
│  ├─ components/
│  │  ├─ ui/                 # shadcn primitives (button, input, dialog, …)
│  │  ├─ layout/             # shell, sidebar, header, breadcrumb
│  │  ├─ auth/
│  │  ├─ products/
│  │  ├─ vendors/
│  │  ├─ categories/
│  │  ├─ orders/
│  │  ├─ users/
│  │  ├─ dashboard/
│  │  └─ ratings/
│  ├─ pages/
│  │  ├─ login.tsx
│  │  ├─ dashboard.tsx
│  │  ├─ products.tsx
│  │  ├─ vendors.tsx
│  │  ├─ categories.tsx
│  │  ├─ users.tsx
│  │  ├─ orders-pending.tsx
│  │  ├─ orders-done.tsx
│  │  ├─ order-detail.tsx
│  │  ├─ new-order.tsx
│  │  └─ rating-form.tsx     # public, no auth
│  └─ routes/
│     ├─ protected-route.tsx
│     ├─ admin-route.tsx
│     └─ index.ts           # route table
├─ public/
├─ index.html
├─ vite.config.ts
├─ tsconfig.json
├─ tailwind.config.ts
├─ postcss.config.js
├─ components.json          # shadcn config
├─ .env.example             # VITE_API_BASE_URL=http://localhost:3000
├─ .env.local
├─ .gitignore
└─ package.json
```

### 0.9 Conventions

- **File naming**: `kebab-case.ts` for modules, `PascalCase.tsx` for components
- **Components**: function components, hooks-only, no classes
- **Data fetching**: all server state via React Query; only cart + UI state via zustand
- **Forms**: `react-hook-form` + `zod` resolver, never raw `useState` for form state
- **Errors**: API errors surface via `sonner` toast; form errors inline under field
- **Dates**: always store/parse as UTC, format with `date-fns` for display
- **Currency**: Decimal from API arrives as string (`"100.00"`); format with `Intl.NumberFormat`
- **Access control**: role-based route guards (admin vs user) + UI element hiding

### 0.10 Phase overview

| Phase | Theme | Sessions | Outcome |
|-------|-------|----------|---------|
| 0 | Project Bootstrap | 3 | Empty Vite app runs, shadcn ready, routing shell works |
| 1 | API & Auth Foundation | 4 | User can log in, token refresh works, protected routes |
| 2 | Catalog Management | 5 | Admin can manage categories, vendors, products; search works |
| 3 | Order Building | 5 | Operator can build a cart and finalize an order |
| 4 | Order Operations | 5 | Operator can manage pending orders end-to-end |
| 5 | Done List & History | 2 | Operator can view delivered orders, filter by month, search |
| 6 | Dashboard | 4 | Admin sees charts + KPIs; operator sees own |
| 7 | User Management | 2 | Admin can CRUD users with category access |
| 8 | Rating System | 2 | Customer can rate via public link |
| 9 | Polish & UX | 3 | Loading states, responsive, accessible |
| 10 | Production Build | 3 | Builds cleanly, env-based, deployed to Nginx |
| 11 | Final QA & Go-Live | 2 | E2E tested, documented, ready for users |
| **Total** | | **40 sessions** | **Complete browser app** |

---

### 0.11 Progress notes (live log)

A short record of what was actually built, deviations from the plan, and
gotchas hit. Updated after each session is committed.

#### Phase 0 — Bootstrap (3/3 done, 4 commits)

| Session | Commit | Notes |
|---------|--------|-------|
| 0.1 | `ed3b98d` | Scaffold moved from standalone `rizqun-ui` repo to `ui/` subfolder of the main `rizqun` repo (per user request — single-deployable-unit requirement). Backend `.gitignore` `/.vscode/` rule scoped to root so `ui/.vscode/{extensions,settings}.json` can be committed. |
| 0.2 | `ab6186b` | shadcn CLI `init` defaulting to `base-nova` style; manually overrode to `new-york` style + `tw-animate-css` (replaces `tailwindcss-animate` which is Tailwind v3 only). shadcn writes imports as literal `src/lib/utils` instead of `@/lib/utils` — fixed in one pass after init. ESLint relaxed `react-refresh/only-export-components` for `src/components/ui/**` and `src/contexts/**` (intentional pattern in shadcn primitives + context providers). React 19 hooks rule flags `setState` inside `useEffect` — refactored `ThemeProvider` to compute `resolvedTheme` via `useMemo` and split `useTheme` hook into its own file. |
| 0.3 | `7d56f70` | All 13 routes smoke-tested (return 200 in both `vite dev` and `vite preview`, confirming SPA fallback works for deep links like `/orders/123` and `/rating/<token>`). `PublicLayout` split into its own file to satisfy `react-refresh/only-export-components` rule in `routes/index.tsx`. TODO markers left in `routes/index.tsx` for Phase 1.4 to wrap `AppShell` in `ProtectedRoute` and gate `/categories` + `/users` with `AdminRoute`. |

#### Phase 1 — API & Auth Foundation (4/4 done, 4 commits — Phase 1 complete)

| Session | Commit | Notes |
|---------|--------|-------|
| 1.1 | `abb240a` | `axios` + `@tanstack/react-query` v5 installed. The 401 refresh interceptor uses `fetch()` for the `/auth/refresh` call instead of `api.post` to avoid (a) re-triggering the request interceptor with a stale token, (b) infinite recursion if refresh itself 401s, and (c) a typing mismatch with the axios module augmentation (the augmentation changes `axios.post<T>` to return `Promise<T>` instead of `Promise<AxiosResponse<T>>` — fine for the `api` instance but wrong for raw `axios` calls). `tokenStore` is a module-level singleton (not React state) so the request interceptor can read the token synchronously. `AuthProvider` (Phase 1.2) subscribes to `tokenStore` and persists to `sessionStorage` on login/logout. Smoke-tested end-to-end against the running backend: 4/4 tests pass (health unwrap, 401 error path, login + cookie, authenticated GET with attached token). Temporary smoke-test page (`_api-smoke-test.tsx`) deleted before commit; dashboard placeholder restored. |
| 1.2 | `0659b33` | `AuthProvider` subscribes to `tokenStore` (re-renders on token change). On mount: hydrates from `sessionStorage` → calls `GET /auth/me` → populates user, or clears on failure. `setLogoutHandler` registers a callback so the axios 401-refresh-failure path stays in sync with React state. `useAuth` hook split into `src/hooks/use-auth.ts` to satisfy `react-refresh/only-export-components`. Sidebar now: (a) filters out `adminOnly` nav items for non-super_admin users, (b) shows real user name + role in footer (or skeleton during hydration, or "Not signed in"), (c) handles `isInitializing` to avoid flashing placeholder "?" before `/auth/me` resolves. Topbar shows user dropdown with real name/email + working Logout button (navigates to `/login` via `useNavigate`); falls back to "Sign in" link when not authenticated. Browser smoke test passes 5/5: initial state → login → refresh (sessionStorage restore) → logout → refresh (stays null). Note: tests must be run with the browser at `http://localhost:5173` (not `127.0.0.1:5173`) so the origin matches the backend's `CORS_ORIGINS` allow-list. |
| 1.3 | `a3edb71` | `react-hook-form` + `@hookform/resolvers` + `zod` installed. Login schema in `src/schemas/auth.ts` mirrors the backend's `loginSchema` (`email` trimmed+lowercased+email, `password` min 1 char — backend intentionally doesn't enforce length on login to prevent user enumeration via password length messages). `Register` schema also exported for Phase 7. Real login page (`src/pages/login.tsx`): centered Card on a slate gradient, email+password fields via shadcn `Form` + `react-hook-form` + `zodResolver`, autofocus on email, Enter submits, autocomplete hints, loading spinner on submit. Already-authenticated users hit `<Navigate to={from} replace />` immediately (the early return is placed AFTER all `useForm` calls so the rules-of-hooks rule isn't violated). `toast` helper in `src/lib/toast.ts` wraps sonner with status-aware messages: 401 → "Invalid email or password." (rate-limit-safe — no enumeration), 429 → "Too many attempts. Please try again in 15 minutes.", 5xx → "Server error. Please try again in a moment." shadcn's generated `sonner.tsx` imported from `next-themes` (which we don't use); rewrote to use our own `useTheme` hook instead. Toaster mounted globally in `App.tsx` (top-right, rich colors, close button). `/rating/:token` already wired as a public route via `PublicLayout` (no shell, no auth) since Phase 0.3. Browser smoke test passes 6/6: form renders → empty submit shows inline errors → wrong password shows "Invalid email or password." toast → correct credentials redirect to `/dashboard` → navigating to `/login` while authed redirects back to `/dashboard` → logout via topbar menu returns to `/login`. Demo credentials hint shows `admin@rizqun.com / ChangeMeInProduction123!` and the seeded operator `grocery.op@rizqun.com / Operator123!` (dev only — remove in production). |
| 1.4 | `5e3234e` | `ProtectedRoute` (`src/routes/protected-route.tsx`) guards every authed route — checks `isAuthenticated`, redirects to `/login` with `state.from = location` so the login page can return the user to the URL they originally requested. Critically, the guard returns `null` while `isInitializing` is true (auth booting from sessionStorage + /auth/me in flight) — this avoids a false redirect-to-/login flash on every page refresh. `AdminRoute` (`src/routes/admin-route.tsx`) gates `/categories` + `/users` for super_admin only — toasts "Admins only." and redirects to `/dashboard` for operators. The toast fires via `useEffect` keyed on `location.pathname`, so navigating between two forbidden routes re-toasts. In React StrictMode (dev), this effect double-invokes → 2 toasts; production build fires once. Route tree now: `ProtectedRoute → AppShell → children` (no sidebar flash before auth redirect); admin-only sub-tree: `ProtectedRoute → AppShell → AdminRoute → CategoriesPage / UsersPage` (admin sidebar visible during the brief redirect bounce so the toast shows in context). Browser smoke test passes 7/7: logged-out visit to /dashboard → /login; login as admin → returned to original URL (`/dashboard` then `/orders/pending`); login as operator (grocery.op) → sidebar hides Categories + Users; operator visits /users directly → /dashboard + "Admins only." toast; operator visits /categories → /dashboard; admin visits /users + /categories → both render. **Phase 1 complete — app is fully auth-gated, all routes work, role-based UI hides admin nav for operators.** |

#### Phase 2 — Catalog Management (5/5 done, 5 commits — Phase 2 complete)

All 5 sessions delivered in a single commit batch (one PR-style commit since
they share types, hooks, and patterns). Key design decisions across the
phase:

| Session | Commit | Notes |
|---------|--------|-------|
| 2.1 | `e58f678` | Categories CRUD: full list + create/edit/delete with confirm dialog. `useCategories` hook does optimistic updates (setQueryData) instead of invalidation so the UI feels instant. Category form auto-generates slug from name in create mode (and respects manual override once the user has touched the slug field). |
| 2.2 | `e58f678` | Vendors CRUD: paginated list + filters (search by name/phone, filter by category, filter by active). Toggle active uses `deactivateVendor` (DELETE → soft delete) when on, and `updateVendor({isActive: true})` when off. WhatsApp validation moved out of zod (`.refine` on optional fields breaks `zodResolver` typing) — done in the form submit handler instead. |
| 2.3 | `e58f678` | Products list: paginated with filters (search, category, active status). Admin sees create/edit/toggle; operator (non-admin) sees read-only badges. Price formatted with `Intl.NumberFormat('en-BD', { currency: 'BDT' })`. |
| 2.4 | `e58f678` | Product create/edit form: name, price (decimal), unit, optional SKU (stripped to undefined on submit if empty), categoryId + vendorId (selects pre-populated from `useCategories` + `useVendors({ limit: 100, isActive: true })`), isActive switch. `useToggleProduct` mutation for the table-row Switch (no dialog needed). |
| 2.5 | `e58f678` | Smart search component (`ProductSearch`) wired into the topbar with cmd+K / ctrl+K global shortcut. Uses `useProductSearch(q, enabled)` — React Query's `enabled: q.length >= 2` handles the debounce gate; `staleTime: 10s` avoids re-searching the same query. Loading state, "Keep typing…", "No products found.", and result rows showing name + category + vendor + price (৳). Selected product currently routes to /products (Phase 3 will route to a detail or cart-add flow). |

**Key gotchas hit during Phase 2:**

1. **`zodResolver` typing breaks on `.default(...)` and `.refine(...)`** — `@hookform/resolvers` v5 + react-hook-form v7 + zod v3 generic mismatch. The resolver widens `TFieldValues` to `FieldValues` (default) when the schema uses `.default()` or `.refine()` on a field. Fix: remove `.default()` from schema (move to `defaultValues` in `useForm`); move `.refine()` to the form submit handler.

2. **React 19 hooks lint: `setState` in `useEffect`** — the new `react-hooks/set-state-in-effect` rule flags `useEffect(() => setPage(1), [filters])`. Fix: move the page reset into the filter setter callbacks (`handleSearchChange`, `handleCategoryChange`, etc.) so it's part of the same state update.

3. **shadcn Select has no `name`** — agent-browser can't find `role: 'combobox', name: 'Category'`. Browser smoke tests for filter dropdowns were flaky for this reason; manual visual verification confirms the filters work.

4. **Bundle size** — the catalog phase pushed JS to 724 KB / 221 KB gzipped. Vite warns about >500 KB chunks. Phase 10.1 will introduce code-splitting via `React.lazy` + manual chunks for vendor libs.

**Phase 2 smoke test results** (against running backend via headless Chrome):
- Categories: list renders 3 seeded + create + edit + delete all work with optimistic UI + toasts
- Vendors: list renders 3 seeded vendors, search by name works, toggle-active works
- Products: list renders 5 seeded products, filter by category works
- Smart search: cmd+K opens dialog, typing "rice" returns Rice Basmati 5kg
- Operator (grocery.op): "New product" button hidden, can only view + toggle (Switch hidden too — operator sees read-only Active/Inactive badge instead)

#### Bug fix between Phase 2 and Phase 3 — `5effecd`

User reported the UI looked broken: only the brand row was visible in the sidebar, no nav items, no breadcrumb, no search bar. Root cause: Tailwind v4's `.inset-y-0` generates `inset-block: 0` (CSS logical property) instead of `top: 0; bottom: 0;` (physical properties, as Tailwind v3 did). Chrome computes `top: 0` and `bottom: 0` correctly from `inset-block: 0` BUT does not auto-stretch a `position: fixed` element to fill the viewport when only the logical `inset-block` is set — the element's height collapses to its content height (just the brand row at h-14 = 56px), pushing the nav + user footer below the visible area. Fix: added explicit `h-screen` (100vh) class to the `<aside>` element. This was a pre-existing bug since Phase 0.3 — smoke tests missed it because `agent-browser`'s snapshot inspects the accessibility tree (which lists all DOM elements regardless of CSS visibility).

#### Phase 3 — Order Building (5/5 done, 5 commits + 2 bugfixes — Phase 3 complete)

| Session | Commit | Notes |
|---------|--------|-------|
| 3.1 | `8600655` | `zustand` installed. Cart store in `src/contexts/cart-store.ts` uses the `persist` middleware with `sessionStorage` (cleared on tab close, not `localStorage`) — matches the auth token behavior so a cart refresh works but a cart never survives a tab close. Store shape: `items: CartItem[]`, `customer: CustomerInfo`, `deliveryFee: number` + 9 actions (addItem with auto-merge on duplicate productId, removeItem, setQty with auto-remove at 0, incrementQty/decrementQty, setCustomer with partial-merge, setDeliveryFee clamped to >= 0, clearItems preserves customer + deliveryFee, clearAll resets everything). Computed selectors exported as plain functions: `computeSubtotal`, `computeItemCount`, `computeTotals`, plus `formatBDT` helper using `Intl.NumberFormat('en-BD', { currency: 'BDT' })`. `useCart` hook wraps the store + memoizes the computed totals so consumers can `const { items, totals, addItem } = useCart()` without re-rendering on every keystroke. CartItem snapshots the product at the time of adding (name, price, vendor info, category info, unit) so the cart stays correct even if the product is later renamed or repriced. Temporary `_cart-smoke-test.tsx` page verified all 11 scenarios end-to-end via headless Chrome: empty state, add 3 products, increment/decrement/remove, customer info update, delivery fee update, refresh persistence, clearItems preserves customer, clearAll resets everything. |
| 3.2 | `cbbab00` | Product picker modal (`src/components/orders/product-picker.tsx`) + cart sidebar (`src/components/orders/cart-sidebar.tsx`) wired into a real `src/pages/new-order.tsx`. The picker uses the same `useProductSearch` hook from Phase 2.5 (debounced via React Query's `enabled: q.length >= 2`), but renders results as inline buttons (not a CommandDialog) so the qty stepper + Add buttons can sit alongside the results. Uses a derived `effectiveSelected = selected ?? results?.data?.[0]` pattern to auto-select the first result without violating the `react-hooks/set-state-in-effect` rule (would have called `setSelected(results.data[0])` inside a useEffect). "Add to cart" closes the modal; "Add another" keeps it open and clears the search for the next product. Recently-added chips (last 5) show what was just added. Cart sidebar is sticky (`top-20`), shows item count badge, qty steppers, remove buttons, and subtotal + deliveryFee + total. Layout is a 2-column grid (`lg:grid-cols-[1fr_360px]`) with customer info + delivery fee + finalize-placeholder on the left and the cart sidebar on the right. Smoke test verified end-to-end via headless Chrome + vision model: click "Add product" → type "rice" → 1 result (Rice Basmati 5kg, BDT 850.00) → select → qty stepper shows "Subtotal: BDT850.00" → click "Add to cart" → modal closes → cart sidebar shows Rice × 1, subtotal BDT 850.00, total BDT 850.00. Vision model confirms layout is "clean and usable". |
| 3.3 | `83a3437` | Quick-add custom product flow. When the product search returns 0 results, a "Not in catalog? Quick-add it" button appears. Clicking it expands an inline form (QuickAddProduct component) inside the picker dialog — pre-fills the search query as the product name so the operator doesn't have to re-type. Form fields: name, price, unit, category (Select — uses categorySlug not categoryId, matching the backend's `quickAddProductSchema`), vendor (Select — only active vendors), optional SKU (auto-generated by backend if blank). On submit: `POST /products/quick-add` creates the product in the catalog (active, available for future orders), then immediately adds it to the cart with qty=1. The picker dialog closes on success. The `useQuickAddProduct` hook invalidates the React Query `['products']` cache so the new product shows up in subsequent searches. Root-cause debug: the form was silently failing validation because `sku: ''` (from defaultValues) failed `z.string().trim().min(1).optional()` — the `.min(1)` rejects empty strings even with `.optional()`. Fixed by removing `.min(1)` from the SKU field (empty string is now valid; the backend handles auto-generation). Also fixed a login "Server error" bug that was hiding CORS origin mismatches: the axios interceptor converted network-error status 0 to 500 via `status || 500`, causing `toast.apiError()` to show "Server error" instead of a helpful "couldn't reach the server" message. Fixed by distinguishing status 0 (network/CORS) from real 5xx, and adding a specific toast message for status 0 that tells the user to use `http://localhost:5173` (not `127.0.0.1`). Added a `print-localhost-hint` Vite plugin that warns at dev-server startup. Smoke test 4/4 pass: search "xyz123" → no results → quick-add → fill form → "Create & add to cart" → cart sidebar shows "Special Test Item × 1, BDT99.99", finalize button shows "(1 items · BDT99.99)". |

---

## Phase 0 — Project Bootstrap

**Goal**: an empty React + Vite + TS + Tailwind + shadcn/ui app boots on
`http://localhost:5173` with the routing shell and a placeholder home page.

### Session 0.1 — Scaffold Vite + React + TypeScript + Tailwind v4

**Goal**: a runnable Vite dev server with TypeScript and Tailwind configured.

**Tasks**:
1. `npm create vite@latest rizqun-ui -- --template react-ts`
2. `cd rizqun-ui && npm install`
3. Install Tailwind v4: `npm install tailwindcss @tailwindcss/vite`
4. Add the Tailwind Vite plugin to `vite.config.ts`
5. Replace `src/index.css` with `@import "tailwindcss";`
6. Add path alias `@/*` → `src/*` in `tsconfig.json` + `vite.config.ts`
7. Install dev tooling: `npm install -D eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser eslint-plugin-react eslint-plugin-react-hooks eslint-config-prettier prettier`
8. Add `.eslintrc.cjs` extending react-hooks + TS recommended
9. Add `.prettierrc.json` matching backend (`singleQuote: true`, `semi: true`, `printWidth: 100`)
10. Add `.gitignore` for `node_modules`, `dist`, `.env.local`, `.env.*.local`
11. `git init && git add . && git commit -m "feat(0.1): scaffold Vite + React + TS + Tailwind v4"`

**Files created**:
- `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`
- `src/main.tsx`, `src/App.tsx`, `src/index.css`
- `.eslintrc.cjs`, `.prettierrc.json`, `.gitignore`

**Acceptance criteria**:
- `npm run dev` starts Vite on `http://localhost:5173` showing "Rizqun UI" placeholder
- `npm run build` produces `dist/` with no errors
- `npm run lint` is clean
- `import { cn } from "@/lib/utils"` resolves (alias works)

**Verification**:
```bash
npm run dev   # → opens browser at 5173
npm run build # → dist/index.html exists
npm run lint  # → 0 errors
```

---

### Session 0.2 — Install shadcn/ui + theme tokens

**Goal**: shadcn primitives available; light/dark theme tokens defined.

**Tasks**:
1. `npx shadcn@latest init` → choose defaults (New York, Neutral, CSS vars)
2. Configure `components.json` (style=new-york, baseColor=neutral, cssVariables=true)
3. Update `src/index.css` with CSS variables for light/dark (`--background`, `--foreground`, `--primary`, etc.)
4. Add `ThemeProvider` (use `next-themes` or a tiny custom context) supporting light/dark/system
5. Install base shadcn components we'll need across phases:
   - `button`, `input`, `label`, `card`, `dialog`, `dropdown-menu`, `select`, `table`, `tabs`,
   - `toast` (sonner), `badge`, `skeleton`, `separator`, `form` (rhf integration), `alert-dialog`,
   - `command`, `popover`, `checkbox`, `switch`, `avatar`, `tooltip`, `scroll-area`
6. Add a `ModeToggle` dropdown in `src/components/layout/mode-toggle.tsx`
7. Commit.

**Files created**:
- `components.json`
- `src/components/ui/*` (shadcn-generated)
- `src/components/layout/mode-toggle.tsx`
- `src/contexts/theme-provider.tsx`

**Acceptance criteria**:
- `import { Button } from "@/components/ui/button"` works
- Mode toggle switches light/dark and persists in `localStorage`
- All installed primitives render in a smoke-test page

**Verification**:
- Add a temporary `/playground` route rendering `<Button variant="default">Test</Button>` + `<Input />`
- Visit `http://localhost:5173/playground` → render works in both themes

---

### Session 0.3 — Routing shell + layout skeleton

**Goal**: a working router with placeholders for all routes; layout shell with sidebar + topbar.

**Tasks**:
1. `npm install react-router-dom`
2. Define route table in `src/routes/index.ts`:
   - `/login` → LoginPage
   - `/` → redirect to `/dashboard`
   - `/dashboard`
   - `/products`
   - `/vendors`
   - `/categories`
   - `/users`
   - `/orders/pending`
   - `/orders/done`
   - `/orders/new`
   - `/orders/:id`
   - `/rating/:token` (public)
   - `*` → NotFound
3. Create `App.tsx` with `<BrowserRouter>` + `<Routes>` consuming the table
4. Create `src/components/layout/app-shell.tsx` (sidebar + topbar + `<Outlet />`)
5. Create `src/components/layout/sidebar.tsx` with nav items (Dashboard, New Order, Pending, Done, Products, Vendors, Categories, Users) — links only, no logic yet
6. Create `src/components/layout/topbar.tsx` with the ModeToggle + a placeholder user menu
7. Create `src/components/layout/breadcrumb.tsx` (auto from route)
8. Create placeholder pages in `src/pages/` — each just renders `<h1>{title}</h1>`
9. Wire the shell as the parent of all authed routes
10. Commit.

**Files created**:
- `src/routes/index.ts`, `src/routes/protected-route.tsx` (placeholder for now)
- `src/components/layout/{app-shell,sidebar,topbar,breadcrumb}.tsx`
- `src/pages/{login,dashboard,products,vendors,categories,users,orders-pending,orders-done,new-order,order-detail,rating-form,not-found}.tsx`

**Acceptance criteria**:
- All routes resolve (placeholders render)
- Sidebar nav highlights the active route
- Light/dark toggle still works inside the shell
- Mobile: sidebar collapses below `md` breakpoint (hidden by default, opens via menu button in topbar)

**Verification**:
- Click through every sidebar link → correct page renders
- Resize to 375px → sidebar collapses, hamburger menu appears

---

## Phase 1 — API & Auth Foundation

**Goal**: user can log in, access token + refresh cookie are handled automatically,
protected routes gate the app, and role-based UI shows/hides nav items.

### Session 1.1 — API client (axios + interceptors)

**Goal**: a typed axios instance with auto token attach and 401 refresh handling.

**Tasks**:
1. `npm install axios`
2. Create `src/lib/env.ts` exporting `API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'`
3. Create `src/lib/api.ts`:
   - `api` axios instance with `baseURL = API_BASE_URL`
   - Request interceptor: attach `Authorization: Bearer <token>` from auth store
   - Response interceptor: unwrap `data.data` on success, throw `ApiError` on `success: false`
   - 401 interceptor: try `POST /auth/refresh` once, retry original request, else logout
   - Prevent refresh infinite loop with a `_retry` flag on failed config
4. Create `src/types/api.ts` with `ApiResponse<T>`, `ApiError` types
5. Create `src/lib/query-client.ts` exporting a configured `QueryClient` (staleTime 30s, retry 1)
6. Add `VITE_API_BASE_URL=http://localhost:3000` to `.env.example` and `.env.local`
7. Commit.

**Files created**:
- `src/lib/{api.ts, env.ts, query-client.ts}`
- `src/types/api.ts`
- `.env.example`, `.env.local`

**Acceptance criteria**:
- `api.get('/health')` returns `{ status: 'ok', ... }`
- Sending a request with a stale access token triggers a single refresh, then retries
- A second consecutive 401 (refresh also fails) triggers logout and redirects to `/login`

**Verification**:
- Temporarily call `api.get('/health')` from `useEffect` in `App.tsx` and log the result
- Manually set a bad token in localStorage → verify refresh runs once, then logout

---

### Session 1.2 — Auth context + token storage

**Goal**: a `useAuth()` hook that exposes user, login, logout, and handles refresh.

**Tasks**:
1. Create `src/contexts/auth-provider.tsx`:
   - Holds `user: PublicUser | null`, `accessToken: string | null`, `isInitializing`, `isAuthenticated`
   - On mount: if a token exists in memory (or sessionStorage), call `GET /auth/me` to hydrate user
   - `login(email, password)` → POST `/auth/login`, store token in `sessionStorage`, set user
   - `logout()` → POST `/auth/logout`, clear token, clear user, navigate to `/login`
   - Exposes a `setToken` for the axios interceptor to call after refresh
2. Store the access token in `sessionStorage` (NOT localStorage) — survives F5, cleared on tab close
3. Wrap `<App />` with `<AuthProvider>` in `main.tsx`
4. Wrap `<App />` with `<QueryClientProvider>` in `main.tsx`
5. Create `src/hooks/use-auth.ts` convenience wrapper: `const { user, login, logout } = useAuth()`
6. Commit.

**Files created**:
- `src/contexts/auth-provider.tsx`
- `src/hooks/use-auth.ts`
- Modified `src/main.tsx`

**Acceptance criteria**:
- After login, `useAuth().user` returns the PublicUser
- Refreshing the page keeps the user logged in (token restored from sessionStorage, /me called)
- Logout clears state and cookie, returns to `/login`

**Verification**:
- Login via console: `useAuth().login({email:'admin@rizqun.com', password:'ChangeMeInProduction123!'})` → user populated
- F5 → still logged in
- `useAuth().logout()` → redirected to `/login`, `/auth/me` returns 401

---

### Session 1.3 — Login page

**Goal**: a polished login page with form validation, error display, rate-limit handling.

**Tasks**:
1. `npm install react-hook-form @hookform/resolvers zod`
2. Create `src/schemas/auth.ts` with `loginSchema` (mirror backend `auth.dto.ts`):
   - `email: z.string().email()`
   - `password: z.string().min(1)`
3. Create `src/pages/login.tsx`:
   - Centered card on a gradient background
   - Email + password inputs (shadcn Input + Label + Form)
   - Submit button with loading spinner
   - Error display: toast for generic, inline for validation
   - On success: `await login(...)`, navigate to `/dashboard` (or the redirect query param)
4. Handle 429 from `/auth/login` (rate limit) — show "Too many attempts, try in 15 min"
5. Handle 401 — show "Invalid email or password" inline
6. Add a "demo credentials" hint showing `admin@rizqun.com / ChangeMeInProduction123!` (dev only)
7. Add the public rating route `/rating/:token` to a separate layout (no auth, no shell)
8. Commit.

**Files created**:
- `src/schemas/auth.ts`
- `src/pages/login.tsx` (replace placeholder)
- `src/routes/public-route.tsx` (for `/login` + `/rating/:token`)

**Acceptance criteria**:
- Empty submit shows inline validation errors
- Wrong password → "Invalid email or password" inline
- Correct credentials → redirect to `/dashboard`
- 5 wrong attempts → 429 handled with friendly message
- Tab order is sensible; Enter submits; autofocus on email

**Verification**:
- Manual test all 5 cases
- Run with `npm run dev`, navigate to `http://localhost:5173/login`

---

### Session 1.4 — Protected routes + role-based UI

**Goal**: protected route guard + admin-only nav + topbar user menu.

**Tasks**:
1. Replace placeholder `protected-route.tsx`:
   - If `!isAuthenticated` → `<Navigate to="/login" state={{ from: location }} />`
   - Else `<Outlet />`
2. Create `src/routes/admin-route.tsx`:
   - If `user.role !== 'super_admin'` → `<Navigate to="/dashboard" />` with toast "Admins only"
3. Apply `<ProtectedRoute>` as parent of all authed routes
4. Apply `<AdminRoute>` to `/categories`, `/users`
5. Update `sidebar.tsx`:
   - Show "Categories" + "Users" nav items only when `user.role === 'super_admin'`
   - Show user name + role badge at top of sidebar
6. Update `topbar.tsx`:
   - User dropdown (avatar + name) with "Logout" item
   - Breadcrumb on the left
7. On app load: if `isAuthenticated` and route is `/login`, redirect to `/dashboard`
8. Commit.

**Files created**:
- `src/routes/admin-route.tsx`
- Modified `protected-route.tsx`, `sidebar.tsx`, `topbar.tsx`

**Acceptance criteria**:
- Visiting `/dashboard` while logged out → redirected to `/login`
- After login, returned to the originally-requested URL
- Logging in as a regular operator → `/categories` and `/users` not visible, direct URL access redirected
- Logging in as super_admin → all nav items visible
- Logout button works from any page

**Verification**:
- Log in as `admin@rizqun.com` (super_admin) — all nav visible
- Log in as `grocery.op@rizqun.com / Operator123!` (user, grocery) — Categories/Users hidden
- Direct URL `/users` as operator → redirected to `/dashboard` with toast

---

## Phase 2 — Catalog Management

**Goal**: admin can manage categories, vendors, products; operator can search products.

### Session 2.1 — Categories CRUD

**Goal**: full category list + create/edit/delete (admin only).

**Tasks**:
1. Create `src/types/category.ts` (`Category`, `CategoryCreate`, `CategoryUpdate`)
2. Create `src/schemas/category.ts` (zod, mirror backend)
3. Create `src/hooks/use-categories.ts`:
   - `useCategories()` — React Query, `GET /categories`
   - `useCreateCategory()` — mutation, invalidate `['categories']`
   - `useUpdateCategory()` — mutation
   - `useDeleteCategory()` — mutation (with confirm dialog)
4. Create `src/pages/categories.tsx`:
   - shadcn `DataTable` (name, slug, created/updated, actions)
   - "New Category" button → dialog with form
   - Row actions: Edit, Delete (alert dialog confirm)
5. Create `src/components/categories/category-form.tsx` (rhf + zod, used by both create + edit)
6. Toast on success/error
7. Commit.

**Files created**:
- `src/types/category.ts`, `src/schemas/category.ts`, `src/hooks/use-categories.ts`
- `src/pages/categories.tsx`, `src/components/categories/category-form.tsx`

**Acceptance criteria**:
- List shows the 3 seeded categories (grocery, medicine, other)
- Create → appears in list
- Edit → updates row in-place (optimistic or after invalidation)
- Delete with confirm → row disappears
- Slug auto-generated from name (lowercase, hyphenated) but editable

**Verification**:
- CRUD each cycle, reload page, data persists
- Try delete a category that has products → backend returns 409, toast shows message

---

### Session 2.2 — Vendors CRUD

**Goal**: same CRUD pattern for vendors.

**Tasks**:
1. Create `src/types/vendor.ts`, `src/schemas/vendor.ts`
2. Create `src/hooks/use-vendors.ts` (paginated list + CRUD mutations)
3. Create `src/pages/vendors.tsx`:
   - DataTable: name, phone, whatsappNumber, category, isActive, actions
   - Filters: search by name/phone, filter by category, filter by active
   - Pagination (page size 20)
4. Create `src/components/vendors/vendor-form.tsx`:
   - name, phone, whatsappNumber (optional, E.164 hint), category (Select), isActive (Switch)
5. Row actions: Edit, Toggle active (instead of hard delete — backend uses soft delete via isActive)
6. Toast on success/error
7. Commit.

**Files created**:
- `src/types/vendor.ts`, `src/schemas/vendor.ts`, `src/hooks/use-vendors.ts`
- `src/pages/vendors.tsx`, `src/components/vendors/vendor-form.tsx`

**Acceptance criteria**:
- List paginated; can navigate pages
- Filter by category narrows the list
- Create vendor → appears
- Edit vendor → updates row
- Toggle active → badge updates
- Search by phone works

**Verification**:
- Use the seed data (Hashem Grocery, City Pharma, General Supplies) for testing
- Verify category dropdown shows grocery/medicine/other

---

### Session 2.3 — Products list + pagination + filter

**Goal**: paginated products list with filters, ready for the operator's main catalog view.

**Tasks**:
1. Create `src/types/product.ts`
2. Create `src/hooks/use-products.ts`:
   - `useProducts({ page, limit, search, categoryId, vendorId, isActive })` paginated query
3. Create `src/pages/products.tsx`:
   - DataTable: name, sku, price, category, vendor, unit, isActive, actions
   - Filter bar: search input, category Select, vendor Select, active Switch
   - Pagination controls
   - "New Product" button (admin only — hide for operators)
4. Price formatted with `Intl.NumberFormat('en-BD', { style: 'currency', currency: 'BDT' })`
5. Commit.

**Files created**:
- `src/types/product.ts`, `src/hooks/use-products.ts`
- `src/pages/products.tsx`

**Acceptance criteria**:
- List shows all 5 seeded products
- Filter by category works
- Search by name (uses regular list `?search=` since list endpoint supports it)
- Pagination works
- Price displays as "৳ 850.00"
- Operator (non-admin) sees no "New Product" button

**Verification**:
- Log in as admin → all controls available
- Log in as operator → no create/edit/delete actions visible

---

### Session 2.4 — Product create/edit form

**Goal**: full product create + edit (admin only).

**Tasks**:
1. Create `src/schemas/product.ts` (mirror backend `products.dto.ts`)
2. Extend `src/hooks/use-products.ts` with `useCreateProduct`, `useUpdateProduct`, `useToggleProduct`
3. Create `src/components/products/product-form.tsx`:
   - name, sku (optional), price (decimal), categoryId (Select), vendorId (Select), unit, isActive (Switch)
   - Price input shows decimal + BDT currency symbol
   - SKU auto-suggest if empty (e.g. `NAME-CAT-001`) — optional
4. Wire into `src/pages/products.tsx`:
   - "New Product" → dialog with empty form
   - Row Edit → dialog pre-filled
   - Row Toggle active → switch directly
5. Commit.

**Files created**:
- `src/schemas/product.ts`
- `src/components/products/product-form.tsx`
- Modified `src/pages/products.tsx`, `src/hooks/use-products.ts`

**Acceptance criteria**:
- Create product → appears in list, toast "Product created"
- Edit product → updates in-place
- Price validation: must be > 0, max 2 decimals
- Vendor Select shows only active vendors
- Category Select shows all categories
- Form errors inline under each field

**Verification**:
- Create product "Test Item" with price 99.99 → row shows "৳ 99.99"
- Try invalid price (negative) → inline error, submit blocked
- Toggle isActive off → badge shows "Inactive" gray

---

### Session 2.5 — Smart search box (debounced)

**Goal**: a debounced global search used by the operator while on a call.

**Tasks**:
1. Extend `src/hooks/use-products.ts` with `useProductSearch(q)`:
   - Calls `GET /products/search?q=`
   - Debounced 300ms via React Query's `enabled: !!q && q.length >= 2`
   - StaleTime 10s (don't re-search same query)
2. Create `src/components/products/product-search.tsx`:
   - shadcn `Command` (combobox) with custom trigger
   - Shows name + vendor name + price in dropdown
   - Keyboard navigation (up/down/enter/esc)
   - "No results" state
   - Optional: "Quick add as custom product" link at the bottom (used in Phase 3.3)
3. Mount in topbar as a global search (cmd+K shortcut opens a `CommandDialog`)
4. Commit.

**Files created**:
- `src/components/products/product-search.tsx`
- Modified `src/hooks/use-products.ts`, `src/components/layout/topbar.tsx`

**Acceptance criteria**:
- Typing "rice" → 1 result (Rice Basmati 5kg) in <500ms
- Typing "paracetamol" → 1 result
- Typing "xyz" → "No products found"
- cmd+K opens search dialog from any page
- Selecting a result navigates to product detail (or adds to cart, if cart open — Phase 3)

**Verification**:
- Use seeded products: search "rice", "sugar", "para", "amox", "water"
- Press cmd+K while on /dashboard → search opens
- Esc closes the dialog

---

## Phase 3 — Order Building

**Goal**: operator can search products, build a cart, add quick-custom products, and finalize an order.

### Session 3.1 — Cart state (zustand)

**Goal**: a persistent cart store that survives navigation but not tab close.

**Tasks**:
1. `npm install zustand`
2. Create `src/contexts/cart-provider.tsx` (or just `src/hooks/use-cart.ts`):
   - State: `items: CartItem[]`, `customer: CustomerInfo`, `deliveryFee: number`
   - `addItem(product, qty)`, `removeItem(id)`, `setQty(id, qty)`, `clear()`
   - `setCustomer(info)`, `setDeliveryFee(amount)`
   - `subtotal` computed (sum of price * qty)
   - `total` = subtotal + deliveryFee
   - Persist to `sessionStorage` (cleared on tab close, not localStorage — cart is per-session)
   - `CartItem`: `{ productId, name, price, vendorId, vendorName, categoryId, qty, lineTotal }`
3. Create `src/types/cart.ts`
4. Commit.

**Files created**:
- `src/contexts/cart-provider.tsx` (or `src/hooks/use-cart.ts`)
- `src/types/cart.ts`

**Acceptance criteria**:
- Add 2 of "Rice Basmati 5kg" (₵850) → subtotal = 1700, lineTotal = 1700
- Add 1 of "Sugar 1kg" (₵95) → subtotal = 1795
- Update qty to 3 → subtotal = 2645
- Remove sugar → subtotal = 2550
- Navigate to another page → cart persists
- Close tab → cart cleared

**Verification**:
- Manual test from browser console: `useCart.getState().addItem(...)` then check state
- Or add a temporary debug panel showing cart contents

---

### Session 3.2 — Product picker modal

**Goal**: a modal where the operator searches/selects products to add to cart.

**Tasks**:
1. Create `src/components/orders/product-picker.tsx`:
   - Trigger: "Add Product" button in the new-order page
   - Modal opens with the smart search box (from 2.5) front and center
   - On select: a qty stepper appears; "Add to Cart" button
   - "Add Another" → keep modal open, clear search
   - Recent additions show at the bottom of the modal
2. Cart sidebar: shows added items, qty steppers, line totals, subtotal
3. Commit.

**Files created**:
- `src/components/orders/product-picker.tsx`
- `src/components/orders/cart-sidebar.tsx`

**Acceptance criteria**:
- Search "rice", select, qty 2, "Add to Cart" → cart sidebar shows Rice x2
- Add 3 different products → all visible in sidebar
- Adjust qty in sidebar → totals update
- Remove item from sidebar → disappears
- Modal can be reopened to add more

**Verification**:
- Add Rice + Sugar + Paracetamol with varying qtys → verify cart state in console
- Reload page → cart still there (sessionStorage)

---

### Session 3.3 — Quick-add custom product

**Goal**: when search returns nothing, operator can quick-add a product on the fly.

**Tasks**:
1. Extend `product-picker.tsx`:
   - If search returns 0 results, show "Not found? Quick-add this as a custom product"
   - Click → opens a small form: name, price, vendorId (Select), categoryId (Select), qty
   - Submit: `POST /products` to create the product, then add to cart with qty
   - The created product is active and usable for future orders
2. Validation: name + price + vendor + category required
3. Commit.

**Files created**:
- `src/components/orders/quick-add-product.tsx`
- Modified `src/components/orders/product-picker.tsx`

**Acceptance criteria**:
- Search "xyz123" → "No products found. Quick-add?"
- Click → form appears
- Fill in "Special Item", price 50, vendor Hashem, category grocery, qty 1 → "Add to Cart"
- Cart shows Special Item x1, and the product now exists in the catalog
- Re-search "special" → product appears in results

**Verification**:
- Add 2 custom products in one cart → both added to cart and catalog
- Verify in `/products` page that the new products exist

---

### Session 3.4 — Customer info + finalize order

**Goal**: customer info form + delivery fee + finalize → API creates the order.

**Tasks**:
1. Create `src/schemas/order.ts` (mirror backend `finalizeOrderSchema`):
   - `customerName: string min 1`
   - `customerPhone: string (BD phone regex)`
   - `customerAddress?: string`
   - `deliveryFee: number >= 0`
   - `items: array of { productId, qty }` (min 1)
2. Create `src/components/orders/customer-info-form.tsx`:
   - customerName, customerPhone (with BD format hint), customerAddress (optional), deliveryFee (default 0)
3. Create `src/pages/new-order.tsx`:
   - Layout: cart sidebar on right, customer info form on left
   - "Finalize Order" button (disabled if cart empty or form invalid)
   - On submit: POST `/orders` with cart + customer info
   - On success: toast "Order ORD-2026-XXXXX created", navigate to `/orders/pending`, clear cart
4. Error display: API returns 400 with multiple errors → show as a list in a toast or alert
5. Commit.

**Files created**:
- `src/schemas/order.ts`
- `src/components/orders/customer-info-form.tsx`
- `src/pages/new-order.tsx`

**Acceptance criteria**:
- Empty cart + valid form → "Finalize" disabled with tooltip "Add at least one item"
- Cart full + empty customer name → inline validation error
- All valid → POST succeeds, order code returned, redirect to pending list
- Backend returns 400 (e.g. product not in operator's category access) → toast with message

**Verification**:
- Build an order with Rice + Sugar, customer "John Doe", phone "01712345678", delivery 50
- Verify order appears in pending list with code ORD-2026-XXXXX

---

### Session 3.5 — Pending list view

**Goal**: pending orders list with the operator's "active queue" view.

**Tasks**:
1. Extend `src/hooks/use-orders.ts` with `usePendingOrders({ customer, page, limit })`:
   - Calls `GET /orders/pending`
2. Create `src/pages/orders-pending.tsx`:
   - DataTable: orderCode, customerName, customerPhone, itemsCount, total, minutesSinceCreated, status, actions
   - Auto-refresh every 30s (React Query `refetchInterval`)
   - "New Order" button in top right
   - Search by customer name/phone (debounced)
3. Row click → navigate to `/orders/:id` (Phase 4.1)
4. Color-code by age: > 10 min yellow, > 30 min orange, > 60 min red badge
5. Commit.

**Files created**:
- `src/hooks/use-orders.ts`
- `src/pages/orders-pending.tsx`

**Acceptance criteria**:
- New order (from Phase 3.4) appears at top (oldest first per backend default)
- Auto-refresh keeps list fresh (visible if another tab finalizes an order)
- Search narrows by name or phone
- Age badge colors work
- Clicking a row opens the detail page

**Verification**:
- Create 3 orders, then wait 1 min, 5 min, 11 min → check badge colors
- Open two browser tabs, finalize in one → other tab shows it within 30s

---

## Phase 4 — Order Operations

**Goal**: operator can manage a pending order end-to-end — view detail, send WhatsApp splits, advance status, edit items, cancel, view audit log.

### Session 4.1 — Order detail modal/page

**Goal**: full order detail with items, vendor info, status timeline, actions.

**Tasks**:
1. Extend `use-orders.ts` with `useOrder(id)`, `useUpdateOrder(id)`, `useUpdateOrderStatus(id)`, `useCancelOrder(id)`
2. Create `src/pages/order-detail.tsx`:
   - Header: orderCode, status badge, customerName, customerPhone, createdAt
   - Customer info card: name, phone, address (with "Copy" + "Call" buttons)
   - Items table: name, vendor, qty, lineTotal, *NEW* badge if addedAfterFinalize
   - Totals: subtotal, deliveryFee, total
   - Status timeline (vertical): pending → waiting_vendor → preparing → picked_up → delivered/cancelled, with timestamps
   - Action bar at bottom: "Send to Vendors" (Phase 4.2), "Status" menu (Phase 4.3), "Add Item" (4.4), "Cancel" (4.5)
3. Back button to return to pending list
4. Commit.

**Files created**:
- `src/pages/order-detail.tsx`
- `src/components/orders/order-status-timeline.tsx`

**Acceptance criteria**:
- All seeded order fields rendered
- Items table sorts by addedAt (initial items first, *NEW* items after)
- Customer phone is a `tel:` link
- Status timeline shows all 5 states with times from audit log
- All actions visible if order is in editable state, hidden/locked once picked_up or delivered

**Verification**:
- Open an order created in Phase 3 → all info visible
- Open a delivered order → action bar shows only "Print Vendor Groups" (no edit/cancel)

---

### Session 4.2 — Vendor groups + WhatsApp send

**Goal**: the operator's killer feature — group items by vendor, copy text, open WhatsApp.

**Tasks**:
1. Extend `use-orders.ts` with `useOrderVendorGroups(id)`
2. Create `src/components/orders/vendor-groups-modal.tsx`:
   - For each vendor: card with vendor name, phone, whatsappNumber, items list, subtotal
   - "Copy Text" button (uses `navigator.clipboard.writeText`) with the formatted copyText from API
   - "Open WhatsApp" button → opens `whatsappUrl` in new tab
   - "*NEW*" badge on items added after finalize
3. Trigger from order detail page
4. Toast on copy success
5. Commit.

**Files created**:
- `src/components/orders/vendor-groups-modal.tsx`
- Modified `src/pages/order-detail.tsx`

**Acceptance criteria**:
- Order with 2 vendors → 2 cards shown
- Copy Text puts formatted vendor sub-list on clipboard
- Open WhatsApp opens `wa.me/<number>?text=<encoded>` in new tab
- Items marked `addedAfterFinalize` show "*NEW*" badge
- Multi-vendor order: each vendor sees only their items + the order code

**Verification**:
- Create an order with Rice (Hashem) + Paracetamol (City Pharma) → 2 vendor cards
- Copy Hashem's text → paste into WhatsApp Web → only Rice appears
- Same for City Pharma → only Paracetamol appears

---

### Session 4.3 — Status update workflow

**Goal**: guided status transitions pending → waiting_vendor → preparing → picked_up → delivered.

**Tasks**:
1. Create `src/components/orders/status-update-menu.tsx`:
   - Dropdown showing the next allowed transition(s)
   - Disabled if no transitions available (terminal states)
   - Optional note field on confirm
2. Use backend's `isTransitionAllowed` matrix (mirror in `src/lib/order-status.ts`)
3. On click: PATCH `/orders/:id/status` with `{ status, note? }`
4. After update: invalidate `['order', id]`, `['orders', 'pending']`, `['orders', 'done']`
5. Optimistic update on the order detail (status badge changes immediately)
6. Error handling: 409 (invalid transition) → toast with backend message
7. On transition to `delivered`: show a confetti toast + "Send Rating Link" button appears
8. Commit.

**Files created**:
- `src/lib/order-status.ts`
- `src/components/orders/status-update-menu.tsx`
- Modified `src/pages/order-detail.tsx`

**Acceptance criteria**:
- Pending order → menu shows "→ Waiting for Vendor"
- After transition → menu shows "→ Preparing", etc.
- Picked_up → menu shows "→ Delivered"
- Delivered/Cancelled → menu disabled, label "Terminal"
- Invalid transition attempt (e.g. direct pending → preparing via API) → 409 toast
- Note field appears optionally

**Verification**:
- Walk an order through all 4 transitions
- Try to skip a step (via DevTools fetch) → toast shows "Invalid status transition"
- After delivered → timeline shows all 5 states, menu disabled

---

### Session 4.4 — Add/remove items mid-flight

**Goal**: customer calls back → operator adds or removes items while order is in editable state.

**Tasks**:
1. Extend `use-orders.ts` with `useAddOrderItem(id)`, `useRemoveOrderItem(id, itemId)`
2. Create `src/components/orders/add-item-modal.tsx`:
   - Same product picker (search + quick-add)
   - Added items get `addedAfterFinalize: true` (backend handles this)
3. Add "Remove" button to each item row in order detail (if `addedAfterFinalize: true` AND order is editable)
   - Confirm dialog
   - Backend also blocks removing the last item (409) — toast the message
4. Block actions when order is in `picked_up` or `delivered` or `cancelled` (UI hides, not just disabled)
5. After mutation: invalidate order detail so totals + *NEW* badges refresh
6. Commit.

**Files created**:
- `src/components/orders/add-item-modal.tsx`
- Modified `src/pages/order-detail.tsx`

**Acceptance criteria**:
- Editable order → "Add Item" button visible; click → picker modal
- Add Rice to an existing order → appears with *NEW* badge, totals recompute
- Remove an *added-after-finalize* item → confirms, removes, totals recompute
- Try to remove an original item → not allowed (backend blocks; UI hides the button)
- Try to remove the last item → 409 toast "Cannot remove the last item. Cancel the order instead."
- Once order is picked_up → "Add Item" + "Remove" hidden

**Verification**:
- Finalize an order with 1 item → add a 2nd via the modal → *NEW* badge visible
- Try removing the original item → button not shown
- Remove the added one → cart back to 1 item
- Transition to picked_up → "Add Item" button disappears

---

### Session 4.5 — Cancel order + audit log

**Goal**: cancel pending orders and view the full audit trail.

**Tasks**:
1. Create `src/components/orders/cancel-order-dialog.tsx`:
   - AlertDialog with optional note
   - On confirm: DELETE `/orders/:id` with `{ note? }`
   - Disabled (hidden) for picked_up, delivered, cancelled orders
2. Create `src/components/orders/audit-log-modal.tsx`:
   - Triggered from order detail page
   - Fetches `GET /orders/:id/audit-log`
   - Vertical timeline of all status_log entries
   - Shows: timestamp, from → to, changed by (user name), note
3. Add "Audit Log" button to order detail
4. Commit.

**Files created**:
- `src/components/orders/cancel-order-dialog.tsx`
- `src/components/orders/audit-log-modal.tsx`
- Modified `src/pages/order-detail.tsx`

**Acceptance criteria**:
- Cancel a pending order with note "Customer changed mind" → status badge becomes "Cancelled"
- After cancel, the order disappears from pending list (it's still in `orders` list with status filter)
- Open audit log → shows all transitions including the cancel event with note
- Audit log shows oldest first, with timestamps in user's timezone
- Cancel button hidden for terminal orders

**Verification**:
- Create an order, cancel it, check audit log has 2 entries: created + cancelled
- Walk an order through all 5 states, check audit log has 5 entries

---

## Phase 5 — Done List & History

**Goal**: operator can browse delivered orders, filter by month, search, and re-print vendor groups.

### Session 5.1 — Done list with month filter + search

**Tasks**:
1. Extend `use-orders.ts` with `useDoneOrders({ page, limit, month, search })`:
   - Calls `GET /orders/done`
2. Create `src/pages/orders-done.tsx`:
   - DataTable: orderCode, customerName, customerPhone, itemsCount, total, createdAt, deliveredAt, actions
   - Month picker (defaults to current month, format `YYYY-MM`)
   - Search by customer name/phone
   - Pagination
3. Row click → `/orders/:id` (Phase 4.1 already handles delivered orders)
4. "Export CSV" button (client-side, no backend route needed)
5. Commit.

**Files created**:
- Modified `src/hooks/use-orders.ts`
- `src/pages/orders-done.tsx`
- `src/components/orders/month-picker.tsx`

**Acceptance criteria**:
- Default view shows current month's delivered orders
- Change month → list updates
- Search "John" → only matching orders
- Pagination works
- Export CSV downloads `done-orders-YYYY-MM.csv` with all columns

**Verification**:
- Deliver 3 orders (use status transitions), then visit /orders/done → 3 rows
- Change month to a previous empty month → "No orders in this month" empty state
- Export → open in Excel → rows match

---

### Session 5.2 — Order history detail + re-print vendor groups

**Goal**: viewing a delivered order's full detail and re-sending vendor splits if needed.

**Tasks**:
1. Verify `order-detail.tsx` (Phase 4.1) handles delivered orders correctly:
   - Status badge shows "Delivered" (green)
   - All action buttons hidden except "Print Vendor Groups" + "Send Rating Link" (Phase 8.1)
   - Items table shows final state
   - Audit log available
2. Add a "Print" / "Print Vendor Groups" button that reopens the vendor-groups modal (read-only)
3. Show the deliveredAt timestamp prominently in the header
4. Show rating status: if rating exists, show stars + comment; if not, show "Awaiting rating" badge
5. Commit.

**Files created**:
- Modified `src/pages/order-detail.tsx`

**Acceptance criteria**:
- Open a delivered order → no edit/cancel actions
- Vendor groups modal re-opens with the final items
- If rated, rating card shows overall + speed + behavior stars + comment
- If unrated, "Awaiting rating" badge in header

**Verification**:
- Submit a rating (Phase 8.2) for a delivered order → come back to detail → rating card visible

---

## Phase 6 — Dashboard

**Goal**: the analytics page — KPI cards + 3 charts. Admin sees all, operator sees own.

### Session 6.1 — Dashboard layout + summary cards

**Tasks**:
1. `npm install recharts`
2. Create `src/hooks/use-dashboard.ts`:
   - `useDashboardSummary(month)` → `GET /dashboard/summary`
   - `useOrdersPerDay(days)` → `GET /dashboard/orders-per-day`
   - `useAvgTimePerDay(days)` → `GET /dashboard/avg-time-per-day`
   - `useCategoryBreakdown(month)` → `GET /dashboard/category-breakdown`
3. Create `src/pages/dashboard.tsx`:
   - Month picker (defaults to current month)
   - 3 KPI cards in a row:
     - Done count (big number)
     - Avg total minutes (or "—" if null)
     - Avg per step (4 sub-stats: p→wv, wv→prep, prep→pu, pu→delivered)
4. Skeletons while loading
5. Commit.

**Files created**:
- `src/hooks/use-dashboard.ts`
- `src/pages/dashboard.tsx`
- `src/components/dashboard/kpi-card.tsx`

**Acceptance criteria**:
- Default view loads current month's summary
- Done count matches orders in done list for that month
- Avg total minutes shows 1 decimal (e.g. "4.6 min") or "—" if no delivered orders
- Each step avg shows 1 decimal (rounded by backend, our fix)
- Empty month → all KPIs show 0 / "—"
- Loading skeletons render before data arrives

**Verification**:
- Deliver 3 orders in current month → dashboard shows doneCount=3
- Set month to 2025-01 → all KPIs show 0 / "—"
- Log in as operator → dashboard shows only their orders

---

### Session 6.2 — Bar chart: orders per day

**Tasks**:
1. Create `src/components/dashboard/orders-per-day-chart.tsx`:
   - Recharts `<BarChart>` with date on X-axis, count on Y-axis
   - Days selector (7, 14, 30, 90)
   - Tooltip shows date + count
   - X-axis formatted as "MMM d" (e.g. "Aug 26")
   - Zero-filled days visible (no gaps)
   - Today highlighted with a darker bar
2. Wire into dashboard page below KPI cards
3. Commit.

**Files created**:
- `src/components/dashboard/orders-per-day-chart.tsx`
- Modified `src/pages/dashboard.tsx`

**Acceptance criteria**:
- Default 30-day view renders 30 bars (most at 0 if few orders)
- Hover shows tooltip with date + count
- Change to 7 days → 7 bars
- Today's bar is highlighted
- Zero-count days still render at 0 (no gaps)

**Verification**:
- Deliver 2 orders today → today's bar shows 2
- Switch to 7 days → 7 bars, only today > 0
- Hover any bar → tooltip

---

### Session 6.3 — Line chart + step time bars

**Tasks**:
1. Create `src/components/dashboard/avg-time-per-day-chart.tsx`:
   - Recharts `<LineChart>` with date on X-axis, avgMinutes on Y-axis
   - Same days selector (synced with bar chart)
   - Null values shown as gaps in the line (don't interpolate)
   - Tooltip shows date + avgMinutes formatted as "X.X min"
2. Create `src/components/dashboard/step-time-bars.tsx`:
   - Horizontal bar chart, 4 bars (one per transition)
   - Labels: "Pending → Waiting Vendor", etc.
   - Value at the end of each bar in minutes
   - Null bars show "—" instead of 0
3. Wire into dashboard page
4. Commit.

**Files created**:
- `src/components/dashboard/avg-time-per-day-chart.tsx`
- `src/components/dashboard/step-time-bars.tsx`
- Modified `src/pages/dashboard.tsx`

**Acceptance criteria**:
- Line chart renders N points matching the days selector
- Days with no deliveries show as gaps, not zero
- Step time bars show 4 transitions with minutes (or "—" if null)
- All numbers show 1 decimal (matching backend rounding)
- Loading skeleton while fetching

**Verification**:
- Deliver 3 orders with 60s delays between transitions → step times ~1.0 min each
- Switch days selector → all charts update together

---

### Session 6.4 — Donut chart: category breakdown

**Tasks**:
1. Create `src/components/dashboard/category-breakdown-chart.tsx`:
   - Recharts `<PieChart>` with donut style
   - Color per category: grocery=emerald, medicine=blue, other=slate
   - Legend with category name + count + percentage
   - Center label: total orders
2. Below the chart: a small table with the same data (for accessibility + screen readers)
3. Empty month → "No data for this month" placeholder instead of chart
4. Commit.

**Files created**:
- `src/components/dashboard/category-breakdown-chart.tsx`
- Modified `src/pages/dashboard.tsx`

**Acceptance criteria**:
- Donut renders with one slice per category that has orders
- Legend shows name, count, percentage
- Center shows total order count
- Empty month → friendly placeholder
- Colors are consistent across visits (same category always same color)

**Verification**:
- Create 3 grocery + 2 medicine orders → donut shows 60% grocery / 40% medicine
- Set month to empty → "No data" placeholder

---

## Phase 7 — User Management

**Goal**: super admin can CRUD users and assign category access.

### Session 7.1 — User list + CRUD (admin only)

**Tasks**:
1. Create `src/types/user.ts`, `src/schemas/user.ts`
2. Create `src/hooks/use-users.ts`:
   - `useUsers({ page, limit, search, role, isActive })` paginated
   - `useCreateUser`, `useUpdateUser`, `useToggleUser`
3. Create `src/pages/users.tsx`:
   - DataTable: name, email, phone, role, categoryAccess (badges), isActive, actions
   - Search by name/email/phone
   - Filter by role (super_admin / user)
   - Filter by active
4. Create `src/components/users/user-form.tsx`:
   - name, email, phone, password (only on create; not editable on update — backend behaviour)
   - role (Select: super_admin / user)
   - categoryAccess (multi-select: grocery, medicine, other, all — Phase 7.2 detail)
   - isActive (Switch)
5. Commit.

**Files created**:
- `src/types/user.ts`, `src/schemas/user.ts`, `src/hooks/use-users.ts`
- `src/pages/users.tsx`, `src/components/users/user-form.tsx`

**Acceptance criteria**:
- Only super_admin can access `/users` (admin route guard from Phase 1.4)
- Create operator with grocery-only access → row shows "grocery" badge
- Edit user → form pre-filled (password field hidden)
- Toggle active → badge updates
- Search by email works

**Verification**:
- Log in as admin → CRUD 3 users with different category access
- Log in as operator → `/users` redirected to dashboard

---

### Session 7.2 — Category access editor

**Goal**: a multi-select widget for assigning category access (the key scoping field).

**Tasks**:
1. Create `src/components/users/category-access-picker.tsx`:
   - shadcn `Command`-based multi-select
   - Options: All (clears others), Grocery, Medicine, Other
   - Shows as badges below the trigger
   - Selecting "All" clears grocery/medicine/other
   - Selecting any specific clears "All"
2. Wire into user-form.tsx
3. Validation: at least 1 selection required (backend requires non-empty array)
4. Commit.

**Files created**:
- `src/components/users/category-access-picker.tsx`
- Modified `src/components/users/user-form.tsx`

**Acceptance criteria**:
- Select "All" → only "All" badge shown
- Select "Grocery" + "Medicine" → both badges shown, "All" not present
- Try to submit with no selection → inline error "At least one category required"
- Existing users show their current access as pre-selected badges

**Verification**:
- Edit `grocery.op@rizqun.com` → only "grocery" badge shown
- Add "medicine" → save → user can now access both (verify by logging in as them — though login requires password change first)

---

## Phase 8 — Rating System

**Goal**: operator sends a rating link; customer submits a rating via public URL.

### Session 8.1 — Generate rating link from delivered order

**Tasks**:
1. Extend `use-orders.ts` with `useGenerateRatingLink(id)`:
   - POST `/orders/:id/rating-link`
2. Create `src/components/orders/rating-link-dialog.tsx`:
   - Triggered from order detail page (only for delivered orders)
   - Calls the mutation, gets back `ratingUrl` (full URL with token)
   - Shows the URL in a copyable input
   - "Copy Link" button + "Open" button (opens in new tab for testing)
   - "Send via WhatsApp" button: opens `wa.me/<customerPhone>?text=<encoded URL>` (deep-link to customer)
3. If a rating already exists: show "Already rated" with the submitted stars + comment, no link generation
4. Commit.

**Files created**:
- `src/components/orders/rating-link-dialog.tsx`
- Modified `src/pages/order-detail.tsx`

**Acceptance criteria**:
- Delivered order → "Send Rating Link" button visible in action bar
- Click → POST returns a URL with token, dialog shows it
- Copy → puts URL on clipboard
- Open → opens `/rating/<token>` in new tab (which renders the public form — Phase 8.2)
- Send via WhatsApp → opens wa.me link with customer's phone + URL
- If already rated → dialog shows "Already rated" + the submitted stars

**Verification**:
- Generate link, copy URL, open in new tab → form appears (Phase 8.2)
- Submit a rating, come back, click "Send Rating Link" again → "Already rated" view

---

### Session 8.2 — Public rating form

**Goal**: a public, no-auth page where the customer rates the order.

**Tasks**:
1. Create `src/pages/rating-form.tsx`:
   - Public route (no auth, no shell — minimal layout)
   - On mount: `GET /orders/rating-form/:token` → fetches order code + vendor info
   - Show order code prominently at top ("Rate your order ORD-2026-XXXXX")
   - 3 star ratings: Overall, Speed, Behavior (1-5)
   - Comment textarea (optional, max 500 chars)
   - Submit button → POST `/ratings` with `{ token, overall, speed, behavior, comment }`
   - On success: thank-you screen with checkmark animation
   - On 409 (already submitted): "You've already rated this order" message
   - On 404 (invalid token): "This rating link is invalid or expired"
2. Create `src/components/ratings/star-rating.tsx`:
   - 5 stars, hover preview, click to set, keyboard accessible
3. Commit.

**Files created**:
- `src/pages/rating-form.tsx`
- `src/components/ratings/star-rating.tsx`
- `src/routes/public-route.tsx` (already created in Phase 1.3)

**Acceptance criteria**:
- Open a valid rating URL → form renders with order code
- Hover over stars → preview
- Click 5 stars overall, 4 speed, 5 behavior, "Excellent service" comment → Submit
- Submit succeeds → thank-you screen
- Re-open the same URL → "Already rated" message
- Open a fake URL `/rating/abc123` → "Invalid link"
- Keyboard accessible: tab through stars, space to select, enter to submit

**Verification**:
- Generate link from an order (Phase 8.1), open URL in incognito, submit
- Come back to order detail → rating card visible with submitted stars + comment
- Try to submit again → "Already rated"

---

## Phase 9 — Polish & UX

**Goal**: production-quality UX — loading states, responsive, accessible.

### Session 9.1 — Loading, skeletons, toasts, error boundaries

**Tasks**:
1. Add skeleton states to every list/table (DataTable loading prop)
2. Add full-page skeleton for order detail while loading
3. Standardize toast usage:
   - Success: green sonner toast, auto-dismiss 3s
   - Error: red sonner toast, manual dismiss
   - Use a helper `src/lib/toast.ts` with `toast.success(msg)`, `toast.error(msg)`, `toast.apiError(error)`
4. Add `src/components/error-boundary.tsx`:
   - Wraps every route
   - Catches render errors, shows friendly "Something went wrong" + "Reload" button
   - Logs to console in dev, sentry-ready hook in prod
5. Add `src/components/empty-state.tsx` for empty lists ("No orders yet", "No products found", etc.)
6. Commit.

**Files created**:
- `src/lib/toast.ts`
- `src/components/error-boundary.tsx`
- `src/components/empty-state.tsx`
- Modified every list page to use skeletons + empty states

**Acceptance criteria**:
- Slow network (throttle in DevTools) → skeletons appear before data
- Trigger a render error → boundary catches, friendly UI shown, reload works
- Empty list → empty state with icon + message + CTA
- All success/error toasts consistent

**Verification**:
- Throttle network to "Slow 3G" in DevTools → verify skeletons
- Throw a fake error in a component → boundary catches
- Visit an empty list (e.g. pending with no orders) → empty state

---

### Session 9.2 — Responsive design + mobile layout

**Tasks**:
1. Verify sidebar collapses to a hamburger drawer on `< md` (already in Phase 0.3)
2. Make all DataTables horizontally scrollable on mobile (shadcn `overflow-x-auto`)
3. Stack KPI cards vertically on mobile (grid-cols-1 sm:grid-cols-3)
4. Order detail page: stack sections vertically on mobile (no side-by-side)
5. Cart sidebar: full-screen sheet on mobile, docked on desktop
6. New order page: stack on mobile (cart below customer form)
7. Test every page at widths 320px, 375px, 768px, 1024px, 1280px
8. Commit.

**Files modified**:
- All pages + key components

**Acceptance criteria**:
- 320px width: every page is usable without horizontal scroll (except tables)
- 768px: 2-column layouts where appropriate
- 1280px: full multi-column dashboards
- Touch targets ≥ 44×44px on mobile

**Verification**:
- Chrome DevTools device toolbar: test iPhone SE (375px), iPad (768px), Desktop (1280px)
- Walk every page on each size, confirm no broken layouts

---

### Session 9.3 — Accessibility (ARIA, keyboard nav)

**Tasks**:
1. Run `@axe-core/cli` or browser Axe extension on every page, fix issues
2. Ensure all interactive elements have visible focus rings (Tailwind `focus-visible:ring-2`)
3. Modal dialogs: focus trap, Esc closes, focus returns to trigger
4. Form fields: associated `<Label htmlFor>`, error messages have `aria-describedby`
5. Tables: `<thead scope="col">`, `<th scope="row">` where applicable
6. Star rating: `role="radiogroup"`, each star `role="radio"` + `aria-checked`
7. Color contrast: verify all text ≥ 4.5:1 against background
8. Add skip-to-content link at the top
9. Commit.

**Files modified**:
- shadcn primitives (mostly already a11y-correct)
- Custom components (star-rating, product-picker)
- Layout (skip link)

**Acceptance criteria**:
- Axe reports 0 violations on every page
- Tab through any page → logical order, visible focus
- Modal: Tab cycles inside, Esc closes, focus returns
- Screen reader (NVDA or VoiceOver) reads every form field with label

**Verification**:
- Install Axe DevTools browser extension, walk every page, fix every issue
- Use only keyboard (Tab, Shift+Tab, Enter, Esc, Arrow keys) to: log in, create an order, update status, log out

---

## Phase 10 — Production Build

**Goal**: builds cleanly, env-based config, deployed to Nginx.

### Session 10.1 — Vite production build + bundle analysis

**Tasks**:
1. Configure `vite.config.ts` for production:
   - `build.target = 'es2020'`
   - `build.outDir = 'dist'`
   - `build.sourcemap = false` (or hidden, for sentry-style error reporting)
   - Manual chunks for vendor splitting (react, recharts, radix)
2. `npm install -D rollup-plugin-visualizer`
3. Run `npm run build`, analyze bundle size
4. Set chunk size warning limit to 500kb; aim for < 300kb initial JS
5. Compress images, lazy-load below-the-fold routes (`React.lazy` + Suspense)
6. Commit.

**Files modified**:
- `vite.config.ts`
- `src/routes/index.ts` (lazy-load routes)

**Acceptance criteria**:
- `npm run build` produces `dist/` with `index.html`, `assets/*.js`, `assets/*.css`
- Initial bundle < 300kb gzipped
- `dist/` can be served by any static host (preview with `npx serve dist`)
- Lazy-loaded routes produce separate chunks

**Verification**:
- `npm run build && npx serve dist` → open browser, app works
- Check network tab: initial load fetches main + react chunks, route chunks lazy on navigation
- Run `npx vite-bundle-visualizer` → no single chunk > 250kb

---

### Session 10.2 — Environment-based config

**Tasks**:
1. Create `.env.example` with:
   - `VITE_API_BASE_URL=http://localhost:3000`
2. Document in README:
   - Dev: `.env.local` with `VITE_API_BASE_URL=http://localhost:3000`
   - Prod: build with `VITE_API_BASE_URL=https://api.yourdomain.com` (or same-origin if Nginx-served)
3. Update `src/lib/env.ts` to read from `import.meta.env.VITE_API_BASE_URL` with fallback
4. Verify production build uses the env value (replace at build time, not runtime)
5. Commit.

**Files modified**:
- `.env.example`
- `src/lib/env.ts`
- `README.md`

**Acceptance criteria**:
- Dev `.env.local` with localhost:3000 → API calls hit local backend
- Prod build with `VITE_API_BASE_URL=https://rizqun.com` → API calls hit production
- Without env var, defaults to `http://localhost:3000` (works for dev)

**Verification**:
- `VITE_API_BASE_URL=https://example.com npm run build` → check `dist/assets/*.js` for the URL
- Serve dist, open browser, network tab shows calls to example.com (will 404, but proves config)

---

### Session 10.3 — Nginx serve + smoke test on VPS

**Goal**: deploy the built frontend alongside the existing backend Nginx config.

**Tasks**:
1. On the VPS (assuming backend already deployed per `deploy/nginx/README.md`):
   ```bash
   # Build locally with prod env
   VITE_API_BASE_URL=https://rizqun.com npm run build

   # Copy to VPS
   scp -r dist/* user@vps:/var/www/rizqun-ui/

   # Or build on the VPS:
   git clone <rizqun-ui-repo> /tmp/rizqun-ui
   cd /tmp/rizqun-ui
   npm ci
   VITE_API_BASE_URL=https://rizqun.com npm run build
   sudo cp -r dist/* /var/www/rizqun-ui/
   sudo chown -R www-data:www-data /var/www/rizqun-ui
   ```
2. Verify Nginx config (already in repo `deploy/nginx/rizqun.conf`) serves `/var/www/rizqun-ui` at `/` with SPA fallback
3. Update backend `.env` on VPS: `CORS_ORIGINS=https://rizqun.com,https://www.rizqun.com`
4. `sudo nginx -t && sudo systemctl reload nginx`
5. Smoke test:
   - Visit `https://rizqun.com` → login page loads
   - Login → dashboard renders with data
   - Navigate every page → works
   - Check console: no CORS errors, no 401 loops
6. Commit any final tweaks.

**Files modified**:
- Possibly `deploy/nginx/rizqun.conf` (if SPA fallback needs adjustment)
- `README.md` (deployment section)

**Acceptance criteria**:
- `https://rizqun.com` loads the login page over HTTPS
- Login works, dashboard data appears (no CORS errors in console)
- All routes work (SPA fallback handles `/orders/:id` etc.)
- Refreshing any deep route (e.g. `/orders/123`) still loads (Nginx serves index.html)
- HTTP → HTTPS redirect works

**Verification**:
- `curl -I https://rizqun.com/` → 200 with text/html
- `curl -I https://rizqun.com/orders/123` → 200 (SPA fallback, not 404)
- `curl https://rizqun.com/health` → backend JSON (proxied)
- Login flow end-to-end on the deployed URL

---

## Phase 11 — Final QA & Go-Live

**Goal**: end-to-end tested, documented, ready for real operators.

### Session 11.1 — End-to-end smoke test (Playwright)

**Tasks**:
1. `npm install -D @playwright/test`
2. Configure `playwright.config.ts`:
   - Base URL `http://localhost:5173`
   - 3 browsers: Chromium, Firefox, WebKit
   - Auto-start Vite dev server + ensure backend is running
3. Write `tests/e2e/smoke.spec.ts` mirroring the backend `scripts/test-e2e.sh`:
   - Login as admin
   - Search "Paracetamol" → 1 result
   - Build cart (Rice + Paracetamol), finalize order
   - Verify in pending list
   - Open vendor groups → 2 groups visible
   - Update status through all 4 transitions
   - Generate rating link, open in new context (no auth), submit rating
   - Verify in done list
   - View dashboard → doneCount includes the new order
4. Run `npx playwright test` → all green
5. Commit.

**Files created**:
- `playwright.config.ts`
- `tests/e2e/smoke.spec.ts`

**Acceptance criteria**:
- All tests pass in all 3 browsers
- Test runs in < 60s
- Test catches regressions (intentionally break something, verify test fails)

**Verification**:
- `npx playwright test` → all green
- Mutate a component (e.g. break login button) → test fails

---

### Session 11.2 — Frontend README + go-live checklist

**Tasks**:
1. Write `README.md` for `rizqun-ui`:
   - Project overview
   - Tech stack
   - Local dev quickstart (with backend running)
   - Environment variables
   - Build + deploy
   - Project structure
   - Available scripts
   - Testing (Playwright)
   - Troubleshooting
2. Write `GO-LIVE-CHECKLIST.md`:
   - Backend deployed (HTTPS, env vars set)
   - Frontend built with prod `VITE_API_BASE_URL`
   - Frontend copied to `/var/www/rizqun-ui`
   - Nginx config reloaded
   - CORS origins include the prod domain
   - Admin password changed from default
   - Operator accounts created with correct category access
   - Test login + order flow end-to-end on production URL
   - Test rating link on a real delivered order
3. Commit.

**Files created**:
- `README.md`
- `GO-LIVE-CHECKLIST.md`

**Acceptance criteria**:
- A new developer can clone the repo, follow README, and have the app running locally in < 10 min
- Go-live checklist has no unchecked items on the production deployment

**Verification**:
- Have someone else follow the README → confirm they reach a working app
- Walk through go-live checklist on a real VPS

---

## Final Outcome

After all 40 sessions, the Rizqun frontend is **a complete browser application**:

✅ **Operators can**:
- Log in with their account
- Search products (smart full-text search)
- Build a cart with multiple products + custom quick-adds
- Finalize orders with customer info + delivery fee
- View their pending queue with auto-refresh
- Open an order, view full detail with audit log
- Send vendor-group WhatsApp splits
- Walk an order through the 4 status transitions
- Add/remove items mid-flight (before picked_up)
- Cancel orders with a note
- View the done list filtered by month + search
- Re-print vendor groups for delivered orders
- Send rating links to customers
- View their own dashboard (own orders only)

✅ **Super admins can additionally**:
- See all operators' orders in dashboard + lists
- Manage categories (CRUD)
- Manage vendors (CRUD + active toggle)
- Manage products (CRUD + active toggle)
- Manage users (CRUD + category access assignment)

✅ **Customers can**:
- Click a rating link from their phone
- Submit a 3-dimension rating (overall, speed, behavior) + comment
- See a thank-you confirmation

✅ **Deployment**:
- Built and deployed to `/var/www/rizqun-ui`
- Served by the existing Nginx config over HTTPS
- Backend API proxied to localhost:3000
- Single domain, single TLS cert
- Production-ready for real operators

---

## Session Tracker

Use this table to track progress. Mark each session `☐` (todo), `⏳` (in progress), or `✓` (done).

```
Phase 0 — Bootstrap
  ✓ 0.1  Scaffold Vite + React + TS + Tailwind v4
  ✓ 0.2  Install shadcn/ui + theme tokens
  ✓ 0.3  Routing shell + layout skeleton

Phase 1 — API & Auth Foundation
  ✓ 1.1  API client (axios + interceptors)
  ✓ 1.2  Auth context + token storage
  ✓ 1.3  Login page
  ✓ 1.4  Protected routes + role-based UI

Phase 2 — Catalog Management
  ✓ 2.1  Categories CRUD
  ✓ 2.2  Vendors CRUD
  ✓ 2.3  Products list + pagination + filter
  ✓ 2.4  Product create/edit form
  ✓ 2.5  Smart search box (debounced)

Phase 3 — Order Building
  ✓ 3.1  Cart state (zustand)
  ✓ 3.2  Product picker modal
  ✓ 3.3  Quick-add custom product
  ✓ 3.4  Customer info + finalize order
  ✓ 3.5  Pending list view

Phase 4 — Order Operations
  ✓ 4.1  Order detail modal/page
  ✓ 4.2  Vendor groups + WhatsApp send
  ☐ 4.3  Status update workflow
  ☐ 4.4  Add/remove items mid-flight
  ☐ 4.5  Cancel order + audit log

Phase 5 — Done List & History
  ☐ 5.1  Done list with month filter + search
  ☐ 5.2  Order history detail + re-print vendor groups

Phase 6 — Dashboard
  ☐ 6.1  Dashboard layout + summary cards
  ☐ 6.2  Bar chart: orders per day
  ☐ 6.3  Line chart + step time bars
  ☐ 6.4  Donut chart: category breakdown

Phase 7 — User Management
  ☐ 7.1  User list + CRUD (admin only)
  ☐ 7.2  Category access editor

Phase 8 — Rating System
  ☐ 8.1  Generate rating link from delivered order
  ☐ 8.2  Public rating form

Phase 9 — Polish & UX
  ☐ 9.1  Loading, skeletons, toasts, error boundaries
  ☐ 9.2  Responsive design + mobile layout
  ☐ 9.3  Accessibility (ARIA, keyboard nav)

Phase 10 — Production Build
  ☐ 10.1 Vite production build + bundle analysis
  ☐ 10.2 Environment-based config
  ☐ 10.3 Nginx serve + smoke test on VPS

Phase 11 — Final QA & Go-Live
  ☐ 11.1 End-to-end smoke test (Playwright)
  ☐ 11.2 Frontend README + go-live checklist

Total: 40 sessions
```

---

## Backend API Quick Reference (used throughout)

```
Auth:
  POST   /auth/login                       { email, password } → { user, accessToken } + cookie
  POST   /auth/refresh                     cookie → { accessToken } + new cookie
  POST   /auth/logout                      clears cookie
  POST   /auth/register   [admin]          { name, email, phone, password, role, categoryAccess[] }
  GET    /auth/me                          → { user } (current user)

Catalog:
  GET    /categories                       → { data: Category[] }
  POST   /categories      [admin]           { slug, name }
  PATCH  /categories/:id  [admin]           { slug?, name? }
  DELETE /categories/:id  [admin]

  GET    /vendors?page=&limit=&search=&category=&isActive=
  POST   /vendors        [admin]            { name, phone, whatsappNumber?, category, isActive? }
  PATCH  /vendors/:id    [admin]
  DELETE /vendors/:id    [admin]            (soft delete via isActive)

  GET    /products?page=&limit=&search=&categoryId=&vendorId=&isActive=
  GET    /products/search?q=
  POST   /products       [admin]            { name, sku?, price, categoryId, vendorId, unit?, isActive? }
  PATCH  /products/:id   [admin]
  DELETE /products/:id   [admin]            (soft delete)

Orders:
  POST   /orders                           { customerName, customerPhone, customerAddress?, deliveryFee, items[] }
  GET    /orders?page=&limit=&status=&from=&to=&search=
  GET    /orders/pending?customer=&page=&limit=
  GET    /orders/done?month=&search=&page=&limit=
  GET    /orders/:id                        → { order: PublicOrder }
  PATCH  /orders/:id                        { customerName?, customerPhone?, customerAddress?, deliveryFee? }
  PATCH  /orders/:id/status                 { status, note? }
  DELETE /orders/:id                         { note? }  (cancel)
  POST   /orders/:id/items                  { productId, qty }
  DELETE /orders/:id/items/:itemId
  GET    /orders/:id/vendor-groups          → { groups: VendorGroup[] }
  GET    /orders/:id/audit-log              → { entries: AuditLogEntry[] }
  POST   /orders/:id/rating-link            → { ratingUrl } (for delivered orders)

Ratings:
  GET    /orders/rating-form/:token         (public) → { orderCode, vendorName? }
  POST   /ratings                           (public) { token, overall, speed, behavior, comment? }

Users:
  GET    /users           [admin]           paginated
  POST   /users           [admin]           { name, email, phone, password, role, categoryAccess[], isActive? }
  PATCH  /users/:id       [admin]           (no password)
  DELETE /users/:id       [admin]           (toggle isActive)

Dashboard:
  GET    /dashboard/summary?month=YYYY-MM   → { month, doneCount, avgTotalMinutes, avgStepMinutes{...} }
  GET    /dashboard/orders-per-day?days=N   → { data: DailyCountPoint[] }
  GET    /dashboard/avg-time-per-day?days=N → { data: DailyAvgTimePoint[] }
  GET    /dashboard/category-breakdown?month=YYYY-MM → { data: CategoryBreakdownPoint[] }

Health:
  GET    /health                           → { status, database: { status, latencyMs } }
```

---

## Order Status Flow Reference

```
                      ┌─────────────┐
                      │   pending   │  ←── order created (POST /orders)
                      └──────┬──────┘
                             │ PATCH status
                             ▼
                      ┌─────────────┐
                      │ waiting_    │
                      │   vendor    │
                      └──────┬──────┘
                             │ PATCH status
                             ▼
                      ┌─────────────┐
                      │  preparing  │
                      └──────┬──────┘
                             │ PATCH status
                             ▼
                      ┌─────────────┐
                      │  picked_up  │  ←── item add/remove blocked after this
                      └──────┬──────┘
                             │ PATCH status
                             ▼
                      ┌─────────────┐
                      │  delivered  │  ←── deliveredAt set, rating link available
                      └─────────────┘
                             │
                             │ (any state above picked_up can also cancel)
                             ▼
                      ┌─────────────┐
                      │  cancelled  │  ←── terminal
                      └─────────────┘
```

---

## End of plan
