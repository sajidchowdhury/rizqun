import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { Category, CategoryResponse, CategoriesResponse } from '@/types/category';
import type { CreateCategoryForm, UpdateCategoryForm } from '@/schemas/category';

// ─── List ─────────────────────────────────────────────────────────

const CATEGORIES_KEY = ['categories'] as const;

export function useCategories() {
  return useQuery({
    queryKey: CATEGORIES_KEY,
    queryFn: async () => {
      const data = (await api.get<CategoriesResponse>('/categories')) as CategoriesResponse;
      return data.data;
    },
  });
}

// ─── Create ───────────────────────────────────────────────────────

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCategoryForm) => {
      const data = (await api.post<CategoryResponse>('/categories', input)) as CategoryResponse;
      return data.category;
    },
    onSuccess: (category) => {
      // Optimistic update — append to the cached list.
      queryClient.setQueryData<Category[]>(CATEGORIES_KEY, (old) =>
        old ? [...old, category] : [category],
      );
      toast.success(`Category "${category.name}" created`);
    },
    onError: (error) => toast.apiError(error),
  });
}

// ─── Update ────────────────────────────────────────────────────────

export function useUpdateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: UpdateCategoryForm & { id: number }) => {
      const data = (await api.patch<CategoryResponse>(
        `/categories/${id}`,
        input,
      )) as CategoryResponse;
      return data.category;
    },
    onSuccess: (category) => {
      queryClient.setQueryData<Category[]>(CATEGORIES_KEY, (old) =>
        old ? old.map((c) => (c.id === category.id ? category : c)) : [category],
      );
      toast.success(`Category "${category.name}" updated`);
    },
    onError: (error) => toast.apiError(error),
  });
}

// ─── Delete ────────────────────────────────────────────────────────

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/categories/${id}`);
      return id;
    },
    onSuccess: (id) => {
      queryClient.setQueryData<Category[]>(CATEGORIES_KEY, (old) =>
        old ? old.filter((c) => c.id !== id) : [],
      );
      toast.success('Category deleted');
    },
    onError: (error) => toast.apiError(error),
  });
}
