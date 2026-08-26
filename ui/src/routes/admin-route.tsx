import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '@/hooks/use-auth';
import { toast } from '@/lib/toast';

/**
 * Route guard for super_admin-only routes (/categories, /users).
 *
 * Must be used INSIDE <ProtectedRoute> — assumes the user is already
 * authenticated. Checks `user.role === 'super_admin'`:
 *   - If yes, render the child route tree (via <Outlet/>).
 *   - If no, redirect to /dashboard and toast "Admins only".
 *
 * The toast is shown once per redirect attempt — guarded by a ref-ish
 * pattern: we use `useEffect` keyed on `location.pathname` so it fires
 * only when the user lands on the forbidden route, not on every re-render.
 *
 * Usage (see routes/index.tsx):
 *   { element: <AdminRoute />, children: [
 *       { path: 'categories', element: <CategoriesPage /> },
 *       { path: 'users',      element: <UsersPage /> },
 *   ]}
 */
export function AdminRoute() {
  const { user } = useAuth();
  const location = useLocation();

  // Re-route guard: if the user loses super_admin mid-session (unlikely
  // but possible if an admin demotes them), the redirect + toast should
  // fire on each new forbidden path they try.
  useEffect(() => {
    if (user && user.role !== 'super_admin') {
      toast.error('Admins only.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  if (!user || user.role !== 'super_admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
