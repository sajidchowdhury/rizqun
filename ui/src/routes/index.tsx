import { Navigate, type RouteObject } from 'react-router-dom';

import { AppShell } from '@/components/layout/app-shell';
import { PublicLayout } from '@/components/layout/public-layout';
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
  {
    path: '/rating/:token',
    element: (
      <PublicLayout>
        <RatingFormPage />
      </PublicLayout>
    ),
  },
];

// ─── Authenticated routes (wrapped by AppShell) ─────────────────────
// TODO Phase 1.4: replace `AppShell` with a `ProtectedRoute` that wraps
// AppShell and checks `useAuth().isAuthenticated`.

const authedRoutes: RouteObject[] = [
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
      { path: 'vendors', element: <VendorsPage /> },
      // TODO Phase 1.4: gate these with <AdminRoute>
      { path: 'categories', element: <CategoriesPage /> },
      { path: 'users', element: <UsersPage /> },
    ],
  },
];

// ─── Full route table ────────────────────────────────────────────────
export const routes: RouteObject[] = [
  ...publicRoutes,
  ...authedRoutes,
  { path: '*', element: <NotFoundPage /> },
];
