import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import type {
  Product,
  ProductListQuery,
  ProductsResponse,
  ProductResponse,
  ProductSearchResponse,
} from '@/types/product';
import type { CreateProductForm, UpdateProductForm } from '@/schemas/product';

// ─── List ─────────────────────────────────────────────────────────

const productsKey = (query: ProductListQuery) => ['products', query] as const;

export function useProducts(query: ProductListQuery = {}) {
  return useQuery({
    queryKey: productsKey(query),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (query.page) params.set('page', String(query.page));
      if (query.limit) params.set('limit', String(query.limit));
      if (query.categoryId) params.set('categoryId', String(query.categoryId));
      if (query.vendorId) params.set('vendorId', String(query.vendorId));
      if (query.isActive !== undefined) params.set('isActive', String(query.isActive));
      if (query.category) params.set('category', query.category);
      if (query.search) params.set('search', query.search);
      const qs = params.toString() ? `?${params.toString()}` : '';
      return (await api.get<ProductsResponse>(`/products${qs}`)) as ProductsResponse;
    },
  });
}

// ─── Search (debounced by the caller; React Query handles caching) ──

export function useProductSearch(q: string, enabled = true) {
  return useQuery({
    queryKey: ['products', 'search', q] as const,
    queryFn: async () => {
      const params = new URLSearchParams({ q });
      return (await api.get<ProductSearchResponse>(
        `/products/search?${params.toString()}`,
      )) as ProductSearchResponse;
    },
    enabled: enabled && q.trim().length >= 2,
    staleTime: 10_000, // 10s — don't re-search same query
    gcTime: 60_000,
  });
}

// ─── Create ───────────────────────────────────────────────────────

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateProductForm) => {
      const data = (await api.post<ProductResponse>('/products', input)) as ProductResponse;
      return data.product;
    },
    onSuccess: (product) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success(`Product "${product.name}" created`);
    },
    onError: (error) => toast.apiError(error),
  });
}

// ─── Update ────────────────────────────────────────────────────────

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: UpdateProductForm & { id: number }) => {
      const data = (await api.patch<ProductResponse>(`/products/${id}`, input)) as ProductResponse;
      return data.product;
    },
    onSuccess: (product) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success(`Product "${product.name}" updated`);
    },
    onError: (error) => toast.apiError(error),
  });
}

// ─── Toggle active (uses update with isActive only) ───────────────

export function useToggleProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const data = (await api.patch<ProductResponse>(`/products/${id}`, {
        isActive,
      })) as ProductResponse;
      return data.product;
    },
    onSuccess: (product: Product) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success(`Product "${product.name}" ${product.isActive ? 'activated' : 'deactivated'}`);
    },
    onError: (error) => toast.apiError(error),
  });
}
