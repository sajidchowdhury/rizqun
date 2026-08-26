import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Menu, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { NAV_ITEMS } from './nav-items';

// Placeholder for the logged-in user. Replaced with real auth in Phase 1.2.
const PLACEHOLDER_USER = {
  name: 'Operator',
  role: 'user' as 'user' | 'super_admin',
};

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  // TODO Phase 1.4: filter NAV_ITEMS by user.role
  const visibleItems = NAV_ITEMS; // .filter((item) => !item.adminOnly || PLACEHOLDER_USER.role === 'super_admin')

  return (
    <>
      {/* Mobile hamburger button — visible only below md */}
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Open sidebar"
        onClick={() => setMobileOpen(true)}
      >
        <Menu className="size-5" />
      </Button>

      {/* Mobile overlay drawer */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/50 transition-opacity md:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        aria-hidden={!mobileOpen}
        onClick={() => setMobileOpen(false)}
      />

      {/* Sidebar itself — slides in on mobile, persistent on md+ */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-sidebar text-sidebar-foreground transition-transform md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Main navigation"
      >
        {/* Brand row */}
        <div className="flex h-14 items-center justify-between border-b px-4">
          <Link to="/dashboard" className="flex items-center gap-2">
            <span className="text-lg font-bold tracking-tight">Rizqun</span>
            <Badge variant="outline" className="text-xs">
              UI
            </Badge>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Close sidebar"
            onClick={() => setMobileOpen(false)}
          >
            <X className="size-5" />
          </Button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-3">
          <ul className="space-y-1">
            {visibleItems.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                          : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                      )
                    }
                  >
                    <Icon className="size-4" />
                    <span>{item.label}</span>
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* User footer */}
        <div className="border-t p-3">
          <div className="flex items-center gap-3 rounded-md px-3 py-2">
            <div className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">
              {PLACEHOLDER_USER.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{PLACEHOLDER_USER.name}</div>
              <div className="text-xs text-muted-foreground capitalize">
                {PLACEHOLDER_USER.role}
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
