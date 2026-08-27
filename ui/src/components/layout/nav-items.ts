import {
  LayoutDashboard,
  PackagePlus,
  ListTodo,
  CheckCircle2,
  Package,
  Store,
  Tags,
  Users,
  PencilLine,
  History,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Marks this item as admin-only — used by the sidebar to hide for
   *  non-super_admin users. The actual role check happens in Phase 1.4. */
  adminOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
  { label: 'New Order', to: '/orders/new', icon: PackagePlus },
  { label: 'Pending', to: '/orders/pending', icon: ListTodo },
  { label: 'Done', to: '/orders/done', icon: CheckCircle2 },
  { label: 'Products', to: '/products', icon: Package },
  { label: 'Update Prices', to: '/prices/update', icon: PencilLine },
  { label: 'Price History', to: '/prices/history', icon: History },
  { label: 'Vendors', to: '/vendors', icon: Store },
  { label: 'Categories', to: '/categories', icon: Tags, adminOnly: true },
  { label: 'Users', to: '/users', icon: Users, adminOnly: true },
];
