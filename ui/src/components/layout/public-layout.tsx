import type { ReactNode } from 'react';

/**
 * Minimal layout for public routes (login, rating form).
 * No sidebar, no topbar — just a centered full-screen container.
 */
export function PublicLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-background">{children}</div>;
}
