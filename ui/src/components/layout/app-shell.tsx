import { Outlet } from 'react-router-dom';

import { Topbar } from './topbar';

/**
 * The application shell — sidebar (inside Topbar) + topbar + page content.
 *
 * Used as the layout element for every authenticated route. The sidebar is
 * rendered inside Topbar because the hamburger trigger lives there; this
 * keeps the mobile drawer state cohesive.
 */
export function AppShell() {
  return (
    <div className="min-h-screen bg-background md:pl-64">
      {/* Topbar (also renders the Sidebar + mobile drawer) */}
      <Topbar />

      {/* Page content */}
      <main className="px-4 py-6 md:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
