import { Outlet } from 'react-router-dom';

import { Topbar } from './topbar';

/**
 * The application shell — sidebar (inside Topbar) + topbar + page content.
 *
 * Used as the layout element for every authenticated route. The sidebar is
 * rendered inside Topbar because the hamburger trigger lives there; this
 * keeps the mobile drawer state cohesive.
 *
 * Note: We use `lg:pl-64` (explicit Tailwind padding) on the outer div
 * instead of `md:pl-64` because Tailwind v4's `md:` breakpoint (768px)
 * kicks in before the sidebar is wide enough to leave room. The sidebar
 * is `w-64` (256px) and on tablets (768-1024px) the content gets too
 * cramped. Using `lg:` (1024px+) ensures the padding only applies when
 * there's enough room.
 *
 * Also, the sidebar is `fixed` so we need padding-left to push the
 * content out from under it. We use `style={{ paddingLeft: '256px' }}`
 * for the lg+ case to avoid any Tailwind v4 logical-property issues
 * (same bug as the `inset-y-0` → `inset-block` issue).
 */
export function AppShell() {
  return (
    <div className="min-h-screen bg-background">
      {/* Topbar (also renders the Sidebar + mobile drawer) */}
      <Topbar />

      {/* Page content — on desktop, offset by sidebar width (256px = 16rem).
          On mobile, no offset (sidebar is a drawer overlay). */}
      <main className="px-4 py-6 md:px-6 lg:px-8 lg:pl-[272px]">
        <div className="mx-auto max-w-7xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
