/** Vendor types — mirrors backend vendor shape
 * (see rizqun/src/modules/vendors/vendors.dto.ts). */

export type VendorCategory = 'grocery' | 'medicine' | 'other';

export interface Vendor {
  id: number;
  name: string;
  phone: string;
  whatsappNumber: string | null;
  category: VendorCategory;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── List query ───────────────────────────────────────────────────

export interface VendorListQuery {
  page?: number;
  limit?: number;
  category?: VendorCategory;
  isActive?: boolean;
  search?: string;
}

export interface VendorsResponse {
  data: Vendor[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface VendorResponse {
  vendor: Vendor;
}

// ─── Form shapes ───────────────────────────────────────────────────

export interface VendorCreateForm {
  name: string;
  phone: string;
  whatsappNumber: string;
  category: VendorCategory;
  isActive: boolean;
}

export interface VendorUpdateForm extends Partial<Omit<VendorCreateForm, 'whatsappNumber'>> {
  whatsappNumber: string | null;
}
