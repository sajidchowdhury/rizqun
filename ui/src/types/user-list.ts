/** User types — mirrors backend's PublicUser + list/CRUD response shapes. */

import type { UserRole } from './user';

export interface User {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  categoryAccess: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserResponse {
  user: User;
}

export interface UsersResponse {
  data: User[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface UserListQuery {
  page?: number;
  limit?: number;
  role?: UserRole;
  isActive?: boolean;
  search?: string;
}

// ─── Form shapes ───────────────────────────────────────────────────

export interface UserCreateForm {
  name: string;
  email: string;
  phone: string;
  password: string;
  role: UserRole;
  categoryAccess: string[];
  isActive: boolean;
}

export type UserUpdateForm = Partial<Omit<UserCreateForm, 'password'>> & {
  password?: string;
};
