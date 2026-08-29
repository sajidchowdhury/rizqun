import { Navigate, type RouteObject } from 'react-router-dom';

import { PublicLayout } from '@/components/layout/public-layout';
import { AppShell } from '@/components/layout/app-shell';
import { ProtectedRoute } from '@/routes/protected-route';
import { AdminRoute } from '@/routes/admin-route';
import { LoginPage } from '@/pages/login';
import { DashboardPage } from '@/pages/dashboard';
import { ProductsPage } from '@/pages/products';
import { VendorsPage } from '@/pages/vendors';
import { CategoriesPage } from '@/pages/categories';
import { UsersPage } from '@/pages/users';
import { OrdersPendingPage } from '@/pages/orders-pending';
import { OrdersDonePage } from '@/pages/orders-done';
import { NewOrderPage } from '@/pages/new-order';
import { OrderDetailPage } from '@/pages/order-detail';
import { RatingFormPage } from '@/pages/rating-form';
import { PricesUpdatePage } from '@/pages/prices-update';
import { PricesHistoryPage } from '@/pages/prices-history';
import { ImportPage } from '@/pages/import';
import { NotFoundPage } from '@/pages/not-found';

// ─── Public routes (no shell, no auth) ──────────────────────────────
// These get a minimal layout — no sidebar, no topbar.

const publicRoutes: RouteObject[] = [
  {
    path: '/login',
    element: (
      <PublicLayout>
        <LoginPage />
      </PublicLayout>
    ),
  },
  // The backend generates URLs as `${appBaseUrl}/rate/:token` — so the
  // route path must match '/rate/:token' (not '/rating/:token').
  {
    path: '/rate/:token',
    element: (
      <PublicLayout>
        <RatingFormPage />
      </PublicLayout>
    ),
  },
];

// ─── Authenticated routes ──────────────────────────────────────────
// Tree:
//   ProtectedRoute       → checks isAuthenticated, else redirect to /login
//     AppShell           → sidebar + topbar + <Outlet/>
//       dashboard, orders/*, products, vendors, categories, users
//
// Admin-only sub-tree:
//   ProtectedRoute → AppShell → AdminRoute → <page>
//
// NOTE: AppShell is INSIDE ProtectedRoute so an unauthenticated visitor
// never sees the sidebar/topbar skeleton flash before the redirect.
// AdminRoute is INSIDE AppShell because we want the sidebar visible
// during the (brief) redirect bounce so the user sees the toast in
// context.

const authedRoutes: RouteObject[] = [
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: 'dashboard', element: <DashboardPage /> },
          { path: 'orders/new', element: <NewOrderPage /> },
          { path: 'orders/pending', element: <OrdersPendingPage /> },
          { path: 'orders/done', element: <OrdersDonePage /> },
          { path: 'orders/:id', element: <OrderDetailPage /> },
          { path: 'products', element: <ProductsPage /> },
          { path: 'import', element: <ImportPage /> },
          { path: 'prices/update', element: <PricesUpdatePage /> },
          { path: 'prices/history', element: <PricesHistoryPage /> },
          { path: 'vendors', element: <VendorsPage /> },
          // super_admin-only routes — guarded by AdminRoute.
          // Sidebar already hides these nav items for operators
          // (see sidebar.tsx), but direct URL access still needs a guard.
          {
            element: <AdminRoute />,
            children: [
              { path: 'categories', element: <CategoriesPage /> },
              { path: 'users', element: <UsersPage /> },
            ],
          },
        ],
      },
    ],
  },
];

// ─── Full route table ────────────────────────────────────────────────
export const routes: RouteObject[] = [
  ...publicRoutes,
  ...authedRoutes,
  { path: '*', element: <NotFoundPage /> },
];
