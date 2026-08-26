import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { User, UserResponse, UsersResponse, UserListQuery } from '@/types/user-list';
import type { CreateUserForm, UpdateUserForm } from '@/schemas/user';

// ─── List (GET /users) ─────────────────────────────────────────

export function useUsers(query: UserListQuery = {}) {
  return useQuery({
    queryKey: ['users', query] as const,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (query.page) params.set('page', String(query.page));
      if (query.limit) params.set('limit', String(query.limit));
      if (query.role) params.set('role', query.role);
      if (query.isActive !== undefined) params.set('isActive', String(query.isActive));
      if (query.search) params.set('search', query.search);
      const qs = params.toString() ? `?${params.toString()}` : '';
      return (await api.get<UsersResponse>(`/users${qs}`)) as UsersResponse;
    },
  });
}

// ─── Create (POST /users) ──────────────────────────────────────

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateUserForm) => {
      const data = (await api.post<UserResponse>('/users', input)) as UserResponse;
      return data.user;
    },
    onSuccess: (user: User) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(`User "${user.name}" created`);
    },
    onError: (error) => toast.apiError(error),
  });
}

// ─── Update (PATCH /users/:id) ────────────────────────────────

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: UpdateUserForm & { id: number }) => {
      const data = (await api.patch<UserResponse>(`/users/${id}`, input)) as UserResponse;
      return data.user;
    },
    onSuccess: (user: User) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(`User "${user.name}" updated`);
    },
    onError: (error) => toast.apiError(error),
  });
}

// ─── Deactivate (DELETE /users/:id) ────────────────────────────

export function useDeactivateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const data = (await api.delete<UserResponse>(`/users/${id}`)) as UserResponse;
      return data.user;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('User deactivated');
    },
    onError: (error) => toast.apiError(error),
  });
}
