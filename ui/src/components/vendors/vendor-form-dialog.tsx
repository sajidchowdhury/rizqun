import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

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
  FormDescription,
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
import { Switch } from '@/components/ui/switch';
import { createVendorSchema, whatsappNumberRegex, type CreateVendorForm } from '@/schemas/vendor';
import type { Vendor } from '@/types/vendor';

interface VendorFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: CreateVendorForm) => void;
  vendor?: Vendor | null;
  submitting?: boolean;
}

export function VendorFormDialog({
  open,
  onOpenChange,
  onSubmit,
  vendor,
  submitting = false,
}: VendorFormDialogProps) {
  const isEdit = !!vendor;

  const form = useForm<CreateVendorForm>({
    resolver: zodResolver(createVendorSchema),
    defaultValues: {
      name: '',
      phone: '',
      whatsappNumber: '',
      category: 'other',
      isActive: true,
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      name: vendor?.name ?? '',
      phone: vendor?.phone ?? '',
      whatsappNumber: vendor?.whatsappNumber ?? '',
      category: vendor?.category ?? 'other',
      isActive: vendor?.isActive ?? true,
    });
  }, [open, vendor, form]);

  function handleSubmit(values: CreateVendorForm) {
    // WhatsApp regex validation done here (not in zod) to avoid the
    // zodResolver typing mismatch with `.refine` on optional fields.
    // Empty string is treated as "no WhatsApp number".
    const whatsapp = values.whatsappNumber?.trim();
    if (whatsapp && whatsapp !== '' && !whatsappNumberRegex.test(whatsapp)) {
      form.setError('whatsappNumber', {
        message: 'WhatsApp number must be 10-15 digits with no + or spaces',
      });
      return;
    }
    // Pass through, with empty whatsapp converted to undefined.
    onSubmit({
      ...values,
      whatsappNumber: whatsapp === '' ? undefined : whatsapp,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit vendor' : 'New vendor'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the vendor information.'
              : 'Vendors supply products. Each vendor has a category (grocery, medicine, other).'}
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
                      placeholder="e.g. Hashem Grocery Store"
                      autoFocus
                      disabled={submitting}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. 01712345678" disabled={submitting} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="whatsappNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>WhatsApp number (optional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. 8801712345678 (E.164, no +)"
                      disabled={submitting}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    E.164 format without the leading +. Used to generate WhatsApp deep links.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={submitting}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="grocery">Grocery</SelectItem>
                      <SelectItem value="medicine">Medicine</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-md border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Active</FormLabel>
                    <FormDescription>
                      Inactive vendors cannot be linked to new products.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={submitting}
                    />
                  </FormControl>
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
                {isEdit ? 'Save changes' : 'Create vendor'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
