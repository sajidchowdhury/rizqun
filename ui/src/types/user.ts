/**
 * User-related types — mirrors the backend's `PublicUser`
 * (see `rizqun/src/modules/auth/auth.service.ts:18`).
 *
 * The backend's Prisma schema defines `role` as the enum UserRole:
 *   enum UserRole { super_admin | user }
 *
 * We mirror it as a string literal union so the frontend doesn't need to
 * depend on the generated Prisma client (which is heavy + backend-only).
 * Update this if the backend schema ever adds a new role.
 */

export type UserRole = 'super_admin' | 'user';

export interface PublicUser {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  /** Category slugs the user can access. Includes 'all' for super admins. */
  categoryAccess: string[];
  isActive: boolean;
}

// ─── Auth API response shapes (envelope data field) ──────────────

export interface LoginResponse {
  user: PublicUser;
  accessToken: string;
}

export interface RefreshResponse {
  accessToken: string;
}

export interface MeResponse {
  user: PublicUser;
}
