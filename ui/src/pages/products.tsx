import { useEffect, useState } from 'react';
import { Pencil, Plus, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ProductImage } from '@/components/products/product-image';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  useCreateProduct,
  useProducts,
  useToggleProduct,
  useUpdateProduct,
} from '@/hooks/use-products';
import { useCategories } from '@/hooks/use-categories';
import { useAuth } from '@/hooks/use-auth';
import { ProductFormDialog } from '@/components/products/product-form-dialog';
import type { Product } from '@/types/product';
import type { CreateProductForm } from '@/schemas/product';

// Bangladesh Taka currency formatter
const bdt = new Intl.NumberFormat('en-BD', {
  style: 'currency',
  currency: 'BDT',
  minimumFractionDigits: 2,
});

export function ProductsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'super_admin';

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryId, setCategoryId] = useState<number | 'all'>('all');
  const [isActive, setIsActive] = useState<'all' | 'true' | 'false'>('all');

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset page to 1 when filters change (done in setters to avoid
  // setState-in-effect lint violation)
  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }
  function handleCategoryChange(value: string) {
    setCategoryId(value === 'all' ? 'all' : Number(value));
    setPage(1);
  }
  function handleIsActiveChange(value: 'all' | 'true' | 'false') {
    setIsActive(value);
    setPage(1);
  }

  const { data, isLoading } = useProducts({
    page,
    limit: 20,
    search: debouncedSearch || undefined,
    categoryId: categoryId === 'all' ? undefined : categoryId,
    isActive: isActive === 'all' ? undefined : isActive === 'true',
  });

  const { data: categories } = useCategories();

  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const toggleProduct = useToggleProduct();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Product | null>(null);

  function handleCreate(values: CreateProductForm) {
    createProduct.mutate(values, { onSuccess: () => setCreateOpen(false) });
  }

  function handleUpdate(values: CreateProductForm) {
    if (!editTarget) return;
    updateProduct.mutate(
      { id: editTarget.id, ...values },
      { onSuccess: () => setEditTarget(null) },
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <p className="text-sm text-muted-foreground">
            Browse the product catalog. Admins can create, edit, and toggle products.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            New product
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-3">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search products…"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={String(categoryId)} onValueChange={handleCategoryChange}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories?.map((cat) => (
                  <SelectItem key={cat.id} value={String(cat.id)}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={isActive}
              onValueChange={(v) => handleIsActiveChange(v as 'all' | 'true' | 'false')}
            >
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="true">Active</SelectItem>
                <SelectItem value="false">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Products {data?.pagination ? `(${data.pagination.total})` : ''}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Image</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Active</TableHead>
                    {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.data.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={isAdmin ? 9 : 8}
                        className="h-24 text-center text-muted-foreground"
                      >
                        No products match your filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data?.data.map((product) => {
                      const hasDiscount = product.discountActive && product.originalPrice;
                      const discountPct = hasDiscount
                        ? Math.round(
                            (1 - Number(product.price) / Number(product.originalPrice)) * 100,
                          )
                        : 0;
                      return (
                        <TableRow key={product.id}>
                          <TableCell>
                            <ProductImage src={product.imageUrl} alt={product.name} size="sm" />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium">{product.name}</span>
                              {hasDiscount && discountPct > 0 && (
                                <Badge variant="destructive" className="text-[10px]">
                                  −{discountPct}%
                                </Badge>
                              )}
                            </div>
                            {product.genericName && (
                              <div className="text-xs text-muted-foreground">
                                {product.genericName}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {product.brand ?? '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="font-mono">{bdt.format(Number(product.price))}</span>
                            {hasDiscount && (
                              <div className="text-xs text-muted-foreground line-through">
                                {bdt.format(Number(product.originalPrice))}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            {product.category && (
                              <Badge variant="outline">{product.category.name}</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {product.vendor?.name ?? '—'}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {product.unit}
                          </TableCell>
                          <TableCell>
                            {isAdmin ? (
                              <Switch
                                checked={product.isActive}
                                onCheckedChange={(checked) =>
                                  toggleProduct.mutate({ id: product.id, isActive: checked })
                                }
                                aria-label={`Toggle active for ${product.name}`}
                              />
                            ) : product.isActive ? (
                              <Badge>Active</Badge>
                            ) : (
                              <Badge variant="secondary">Inactive</Badge>
                            )}
                          </TableCell>
                          {isAdmin && (
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setEditTarget(product)}
                                aria-label={`Edit ${product.name}`}
                              >
                                <Pencil className="size-4" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>

              {/* Pagination */}
              {data && data.pagination.totalPages > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <p className="text-sm text-muted-foreground">
                    Page {data.pagination.page} of {data.pagination.totalPages} (
                    {data.pagination.total} products)
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
                      disabled={page >= data.pagination.totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Create dialog (admin only) */}
      {isAdmin && (
        <ProductFormDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onSubmit={handleCreate}
          submitting={createProduct.isPending}
        />
      )}

      {/* Edit dialog (admin only) */}
      {isAdmin && (
        <ProductFormDialog
          open={!!editTarget}
          onOpenChange={(open) => !open && setEditTarget(null)}
          product={editTarget}
          onSubmit={handleUpdate}
          submitting={updateProduct.isPending}
        />
      )}
    </div>
  );
}
