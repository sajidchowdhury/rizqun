import { Outlet } from 'react-router-dom';

import { Topbar } from './topbar';
import { ErrorBoundary } from '@/components/error-boundary';

/**
 * The application shell — sidebar (inside Topbar) + topbar + page content.
 *
 * Wraps the page content in an ErrorBoundary so render errors show a
 * friendly fallback instead of a blank white screen.
 */
export function AppShell() {
  return (
    <div className="min-h-screen bg-background">
      {/* Skip-to-content link for keyboard / screen-reader users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>

      {/* Topbar (also renders the Sidebar + mobile drawer) */}
      <Topbar />

      {/* Page content — on desktop, offset by sidebar width (256px = 16rem).
          On mobile, no offset (sidebar is a drawer overlay). */}
      <main id="main-content" className="px-4 py-6 md:px-6 lg:px-8 lg:pl-[272px]">
        <div className="mx-auto max-w-7xl">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}
