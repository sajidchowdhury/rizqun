import { Fragment } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

import { cn } from '@/lib/utils';

interface Crumb {
  label: string;
  to?: string;
}

// ─── Static labels for routes whose name isn't derivable from the path ──
const LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  products: 'Products',
  vendors: 'Vendors',
  categories: 'Categories',
  users: 'Users',
  login: 'Login',
  pending: 'Pending Orders',
  done: 'Done Orders',
  new: 'New Order',
  orders: 'Orders',
  rating: 'Rating',
};

/**
 * Derives breadcrumbs from the current URL.
 *
 * Examples:
 *   /dashboard                    → [Dashboard]
 *   /orders/pending                → [Orders, Pending Orders]
 *   /orders/123                    → [Orders, #123]
 *   /orders/123/vendor-groups      → [Orders, #123, Vendor Groups]
 *   /rating/<token>                → [Rating] (token intentionally hidden)
 */
function useBreadcrumbs(): Crumb[] {
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);

  // Hide crumbs for the rating page (it's a public, no-shell route anyway).
  if (segments[0] === 'rating') return [];

  const crumbs: Crumb[] = [];
  let acc = '';

  for (const seg of segments) {
    acc += '/' + seg;
    // Numeric segments are IDs — show as #<id>
    if (/^\d+$/.test(seg)) {
      crumbs.push({ label: `#${seg}`, to: acc });
      continue;
    }
    const label = LABELS[seg] ?? seg.charAt(0).toUpperCase() + seg.slice(1);
    crumbs.push({ label, to: acc });
  }

  return crumbs;
}

export function Breadcrumb() {
  const crumbs = useBreadcrumbs();

  if (crumbs.length === 0) {
    return <span className="text-sm font-medium">Rizqun</span>;
  }

  return (
    <nav aria-label="Breadcrumb" className="flex items-center text-sm">
      <ol className="flex items-center gap-1.5">
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <Fragment key={i}>
              {i > 0 && <ChevronRight className="size-3.5 text-muted-foreground" />}
              {isLast || !crumb.to ? (
                <span
                  className={cn(
                    'font-medium',
                    isLast ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {crumb.label}
                </span>
              ) : (
                <Link
                  to={crumb.to}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  {crumb.label}
                </Link>
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
