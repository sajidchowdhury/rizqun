import type { CustomerInfo } from '@/types/cart';

/**
 * Customer info validation rules — shared between the CustomerPicker
 * (inline error display) and the New Order page (Finalize-button gate).
 *
 * Phone must be a valid Bangladeshi mobile number (matches the backend's
 * `finalizeOrderSchema` regex in `orders.dto.ts`).
 */
export function validateCustomer(c: CustomerInfo): {
  name: string | null;
  phone: string | null;
} {
  const name =
    c.name.trim().length < 2 ? 'Name must be at least 2 characters' : null;
  const phone =
    c.phone.trim().length === 0
      ? 'Phone is required'
      : !/^(\+?880|0)1[3-9]\d{8}$/.test(c.phone.trim())
        ? 'Must be a valid Bangladeshi number (e.g. 017XXXXXXXX)'
        : null;
  return { name, phone };
}
