import { useEffect, useState } from 'react';
import { Pencil, Plus, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
  useCreateVendor,
  useDeactivateVendor,
  useUpdateVendor,
  useVendors,
} from '@/hooks/use-vendors';
import { VendorFormDialog } from '@/components/vendors/vendor-form-dialog';
import type { Vendor, VendorCategory } from '@/types/vendor';
import type { CreateVendorForm } from '@/schemas/vendor';

const CATEGORY_LABELS: Record<VendorCategory, string> = {
  grocery: 'Grocery',
  medicine: 'Medicine',
  other: 'Other',
};

export function VendorsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [category, setCategory] = useState<VendorCategory | 'all'>('all');
  const [isActive, setIsActive] = useState<'all' | 'true' | 'false'>('all');

  // Debounce search input by 300ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Whenever filters change, reset page to 1. Done inline in the setters
  // to avoid setState-in-effect lint violation.
  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }
  function handleCategoryChange(value: VendorCategory | 'all') {
    setCategory(value);
    setPage(1);
  }
  function handleIsActiveChange(value: 'all' | 'true' | 'false') {
    setIsActive(value);
    setPage(1);
  }

  const { data, isLoading } = useVendors({
    page,
    limit: 20,
    search: debouncedSearch || undefined,
    category: category === 'all' ? undefined : category,
    isActive: isActive === 'all' ? undefined : isActive === 'true',
  });

  const createVendor = useCreateVendor();
  const updateVendor = useUpdateVendor();
  const deactivateVendor = useDeactivateVendor();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Vendor | null>(null);

  function handleCreate(values: CreateVendorForm) {
    createVendor.mutate(values, { onSuccess: () => setCreateOpen(false) });
  }

  function handleUpdate(values: CreateVendorForm) {
    if (!editTarget) return;
    updateVendor.mutate({ id: editTarget.id, ...values }, { onSuccess: () => setEditTarget(null) });
  }

  function handleToggleActive(vendor: Vendor) {
    if (vendor.isActive) {
      deactivateVendor.mutate(vendor.id);
    } else {
      updateVendor.mutate({ id: vendor.id, isActive: true });
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vendors</h1>
          <p className="text-sm text-muted-foreground">
            Vendors supply products. Each vendor has a category (grocery, medicine, other).
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          New vendor
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-3">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name or phone…"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select
              value={category}
              onValueChange={(v) => handleCategoryChange(v as VendorCategory | 'all')}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                <SelectItem value="grocery">Grocery</SelectItem>
                <SelectItem value="medicine">Medicine</SelectItem>
                <SelectItem value="other">Other</SelectItem>
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
          <CardTitle>Vendors {data?.pagination ? `(${data.pagination.total})` : ''}</CardTitle>
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
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>WhatsApp</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.data.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                        No vendors match your filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data?.data.map((vendor) => (
                      <TableRow key={vendor.id}>
                        <TableCell className="font-medium">{vendor.name}</TableCell>
                        <TableCell className="font-mono text-sm">{vendor.phone}</TableCell>
                        <TableCell className="font-mono text-sm text-muted-foreground">
                          {vendor.whatsappNumber ?? '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{CATEGORY_LABELS[vendor.category]}</Badge>
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={vendor.isActive}
                            onCheckedChange={() => handleToggleActive(vendor)}
                            aria-label={`Toggle active for ${vendor.name}`}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditTarget(vendor)}
                            aria-label={`Edit ${vendor.name}`}
                          >
                            <Pencil className="size-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              {/* Pagination */}
              {data && data.pagination.totalPages > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <p className="text-sm text-muted-foreground">
                    Page {data.pagination.page} of {data.pagination.totalPages} (
                    {data.pagination.total} vendors)
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

      {/* Create dialog */}
      <VendorFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={handleCreate}
        submitting={createVendor.isPending}
      />

      {/* Edit dialog */}
      <VendorFormDialog
        open={!!editTarget}
        onOpenChange={(open) => !open && setEditTarget(null)}
        vendor={editTarget}
        onSubmit={handleUpdate}
        submitting={updateVendor.isPending}
      />
    </div>
  );
}
