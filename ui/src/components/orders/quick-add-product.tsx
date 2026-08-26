import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCategories } from '@/hooks/use-categories';
import { useVendors } from '@/hooks/use-vendors';
import { useQuickAddProduct } from '@/hooks/use-products';
import { useCart } from '@/hooks/use-cart';
import { quickAddProductSchema, type QuickAddProductForm } from '@/schemas/product';
import type { Product } from '@/types/product';

interface QuickAddProductProps {
  /** Pre-fill the name field with the search query that returned no
   *  results — saves the operator from re-typing. */
  defaultName?: string;
  /** Called after the product is created AND added to the cart. */
  onSuccess?: (product: Product) => void;
  /** Called when the user cancels (clicks "Cancel" or closes the form). */
  onCancel?: () => void;
}

export function QuickAddProduct({ defaultName, onSuccess, onCancel }: QuickAddProductProps) {
  const { data: categories } = useCategories();
  const { data: vendors } = useVendors({ limit: 100, isActive: true });
  const quickAdd = useQuickAddProduct();
  const { addItem } = useCart();

  const form = useForm<QuickAddProductForm>({
    resolver: zodResolver(quickAddProductSchema),
    defaultValues: {
      name: defaultName ?? '',
      price: 0,
      vendorId: 0,
      categorySlug: '',
      unit: 'pcs',
      sku: '',
    },
  });

  // Re-sync the name field when `defaultName` changes (e.g. the user
  // types "xyz123" in the search, gets no results, clicks "Quick-add"
  // — the form should pre-fill "xyz123" as the product name).
  // Done in the onChange handler of the parent trigger to avoid the
  // setState-in-effect rule; this effect only fires when the form is
  // first mounted with a non-empty defaultName.
  useEffect(() => {
    if (defaultName) {
      form.setValue('name', defaultName);
    }
  }, [defaultName, form]);

  async function onSubmit(values: QuickAddProductForm) {
    // Strip empty SKU → undefined (backend auto-generates).
    const cleaned: QuickAddProductForm = {
      ...values,
      sku: values.sku?.trim() === '' ? undefined : values.sku?.trim(),
      unit: values.unit?.trim() === '' ? undefined : values.unit?.trim(),
    };
    const product = await quickAdd.mutateAsync(cleaned);
    if (product) {
      // Add to the cart immediately with qty=1 (the operator can adjust
      // the qty in the cart sidebar if needed).
      addItem({
        productId: product.id,
        name: product.name,
        price: product.price,
        vendorId: product.vendorId,
        vendorName: product.vendor?.name ?? '',
        categoryId: product.categoryId,
        categorySlug: product.category?.slug ?? '',
        categoryName: product.category?.name ?? '',
        unit: product.unit,
        qty: 1,
      });
      onSuccess?.(product);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Product name</FormLabel>
              <FormControl>
                <Input
                  placeholder="e.g. Special Item"
                  autoFocus
                  disabled={quickAdd.isPending}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="price"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Price (৳)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    disabled={quickAdd.isPending}
                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                    value={field.value}
                    name={field.name}
                    ref={field.ref}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="unit"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Unit</FormLabel>
                <FormControl>
                  <Input placeholder="pcs, kg, box…" disabled={quickAdd.isPending} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="categorySlug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category</FormLabel>
              <Select
                onValueChange={field.onChange}
                value={field.value}
                disabled={quickAdd.isPending}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {categories?.map((cat) => (
                    <SelectItem key={cat.id} value={cat.slug}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="vendorId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Vendor</FormLabel>
              <Select
                onValueChange={(v) => field.onChange(Number(v))}
                value={String(field.value)}
                disabled={quickAdd.isPending}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a vendor" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {vendors?.data.map((v) => (
                    <SelectItem key={v.id} value={String(v.id)}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="sku"
          render={({ field }) => (
            <FormItem>
              <FormLabel>SKU (optional)</FormLabel>
              <FormControl>
                <Input
                  placeholder="Auto-generated as QUICK-{userId}-{timestamp} if left blank"
                  disabled={quickAdd.isPending}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={quickAdd.isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={quickAdd.isPending}>
            {quickAdd.isPending ? 'Creating…' : 'Create & add to cart'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
