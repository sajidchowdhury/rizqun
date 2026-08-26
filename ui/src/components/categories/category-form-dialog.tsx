import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { createCategorySchema, type CreateCategoryForm } from '@/schemas/category';
import type { Category } from '@/types/category';

interface CategoryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: CreateCategoryForm) => void;
  /** When provided, edit mode. When null/undefined, create mode. */
  category?: Category | null;
  submitting?: boolean;
}

/** Auto-generates a slug from a name: lowercase, spaces → hyphens, strip
 *  non-alphanumerics. Mirrors what most CMSes do. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function CategoryFormDialog({
  open,
  onOpenChange,
  onSubmit,
  category,
  submitting = false,
}: CategoryFormDialogProps) {
  const isEdit = !!category;

  const form = useForm<CreateCategoryForm>({
    resolver: zodResolver(createCategorySchema),
    defaultValues: {
      slug: '',
      name: '',
    },
  });

  // Reset form values when the dialog opens or category changes.
  useEffect(() => {
    if (!open) return;
    form.reset({
      slug: category?.slug ?? '',
      name: category?.name ?? '',
    });
  }, [open, category, form]);

  // Auto-generate slug from name in create mode (but allow manual override
  // once the user has touched the slug field).
  const slugTouched = form.formState.touchedFields.slug;
  function handleNameChange(name: string) {
    form.setValue('name', name);
    if (!isEdit && !slugTouched) {
      form.setValue('slug', slugify(name));
    }
  }

  function handleSubmit(values: CreateCategoryForm) {
    onSubmit(values);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit category' : 'New category'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the category name or slug.'
              : 'Categories group products for search and operator access scoping.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Grocery"
                      autoFocus
                      disabled={submitting}
                      {...field}
                      onChange={(e) => handleNameChange(e.target.value)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Slug</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. grocery" disabled={submitting} {...field} />
                  </FormControl>
                  <FormMessage />
                  <p className="text-xs text-muted-foreground">
                    Lowercase letters, digits, hyphens, underscores only.
                  </p>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {isEdit ? 'Save changes' : 'Create category'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
