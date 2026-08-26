import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { Vendor, VendorListQuery, VendorsResponse, VendorResponse } from '@/types/vendor';
import type { CreateVendorForm, UpdateVendorForm } from '@/schemas/vendor';

// ─── List ─────────────────────────────────────────────────────────

const vendorsKey = (query: VendorListQuery) => ['vendors', query] as const;

export function useVendors(query: VendorListQuery = {}) {
  return useQuery({
    queryKey: vendorsKey(query),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (query.page) params.set('page', String(query.page));
      if (query.limit) params.set('limit', String(query.limit));
      if (query.category) params.set('category', query.category);
      if (query.isActive !== undefined) params.set('isActive', String(query.isActive));
      if (query.search) params.set('search', query.search);
      const qs = params.toString() ? `?${params.toString()}` : '';
      return (await api.get<VendorsResponse>(`/vendors${qs}`)) as VendorsResponse;
    },
  });
}

// ─── Create ───────────────────────────────────────────────────────

export function useCreateVendor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateVendorForm) => {
      const data = (await api.post<VendorResponse>('/vendors', input)) as VendorResponse;
      return data.vendor;
    },
    onSuccess: (vendor) => {
      // Invalidate all vendor queries — list filters may change.
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      toast.success(`Vendor "${vendor.name}" created`);
    },
    onError: (error) => toast.apiError(error),
  });
}

// ─── Update ────────────────────────────────────────────────────────

export function useUpdateVendor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: UpdateVendorForm & { id: number }) => {
      const data = (await api.patch<VendorResponse>(`/vendors/${id}`, input)) as VendorResponse;
      return data.vendor;
    },
    onSuccess: (vendor) => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      toast.success(`Vendor "${vendor.name}" updated`);
    },
    onError: (error) => toast.apiError(error),
  });
}

// ─── Deactivate (DELETE → soft-delete via isActive) ────────────────

export function useDeactivateVendor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const data = (await api.delete<VendorResponse>(`/vendors/${id}`)) as VendorResponse;
      return data.vendor;
    },
    onSuccess: (vendor: Vendor) => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      toast.success(`Vendor "${vendor.name}" deactivated`);
    },
    onError: (error) => toast.apiError(error),
  });
}
