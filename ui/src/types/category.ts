/** Category types — mirrors backend `PublicCategory`
 * (see rizqun/src/modules/categories/categories.dto.ts). */

export interface Category {
  id: number;
  slug: string;
  name: string;
  createdAt: string; // ISO date string (from JSON)
  updatedAt: string;
}

// Response envelope shapes
export interface CategoriesResponse {
  data: Category[];
}

export interface CategoryResponse {
  category: Category;
}

// Form shapes
export interface CategoryCreateForm {
  slug: string;
  name: string;
}

export type CategoryUpdateForm = Partial<CategoryCreateForm>;
