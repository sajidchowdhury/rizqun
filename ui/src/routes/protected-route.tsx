import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '@/hooks/use-auth';

/**
 * Route guard for authenticated routes.
 *
 * - If `isInitializing` is true (token being hydrated + /auth/me in flight),
 *   render nothing — we don't want to flash a redirect to /login before the
 *   auth state has resolved.
 * - If authenticated, render the child route tree (via <Outlet/>).
 * - Otherwise, redirect to /login and pass `state.from` so the login page
 *   can return the user to the URL they originally requested.
 *
 * Usage (see routes/index.tsx):
 *   { element: <ProtectedRoute />, children: [...authedRoutes] }
 */
export function ProtectedRoute() {
  const { isAuthenticated, isInitializing } = useAuth();
  const location = useLocation();

  // Don't make a redirect decision while auth is still booting.
  // A short blank screen for ~200ms is far better than a false redirect
  // to /login that would log the user out on every page refresh.
  if (isInitializing) {
    return null;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
