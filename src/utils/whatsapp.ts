// WhatsApp helpers — builds the copy-paste text and the wa.me deep-link URL
// for a vendor's slice of an order.
//
// The copy text follows this template:
//
//   Order: ORD-2026-00001
//   Vendor: Hashem Grocery
//   Customer: Rahim Uddin
//   Phone: 01712345678
//   Address: House 12, Road 5, Dhanmondi
//
//   Items:
//   1. Rice (Basmati) — 5 kg
//   2. *NEW* Sugar — 2 kg
//
//   Subtotal: 790 BDT
//   Please confirm availability. Thank you.
//
// `*NEW*` markers (WhatsApp bold syntax) appear on items added after the
// order was finalized, so the vendor can spot late additions at a glance.

import type { Prisma } from '@prisma/client';

// ─── Types ──────────────────────────────────────────────────────

interface CopyItem {
  productNameSnapshot: string;
  qty: number;
  unit?: string | null;
  priceSnapshot: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  addedAfterFinalize: boolean;
}

interface CopyContext {
  orderCode: string;
  vendorName: string;
  vendorPhone: string;
  customerName: string;
  customerPhone: string;
  customerAddress?: string | null;
  items: CopyItem[];
  subtotal: Prisma.Decimal;
}

// ─── Build copy text ────────────────────────────────────────────

export function buildVendorCopyText(ctx: CopyContext): string {
  const lines: string[] = [];

  lines.push(`Order: ${ctx.orderCode}`);
  lines.push(`Vendor: ${ctx.vendorName}`);
  lines.push(`Customer: ${ctx.customerName}`);
  lines.push(`Phone: ${ctx.customerPhone}`);
  if (ctx.customerAddress) {
    lines.push(`Address: ${ctx.customerAddress}`);
  }

  lines.push('');
  lines.push('Items:');

  ctx.items.forEach((item, i) => {
    const num = i + 1;
    const newMarker = item.addedAfterFinalize ? '*NEW* ' : '';
    const unit = item.unit ? ` ${item.unit}` : '';
    lines.push(`${num}. ${newMarker}${item.productNameSnapshot} — ${item.qty}${unit}`);
  });

  lines.push('');
  lines.push(`Subtotal: ${ctx.subtotal} BDT`);
  lines.push('Please confirm availability. Thank you.');

  return lines.join('\n');
}

// ─── Build wa.me URL ────────────────────────────────────────────
//
// Format: https://wa.me/<number>?text=<urlencoded text>
//   - <number> is E.164 format WITHOUT the leading '+' (e.g. '8801711111111')
//   - We DON'T strip leading '+' if the stored number happens to have one,
//     because wa.me is strict: 'https://wa.me/+88017...' returns an error.
//     The vendor schema enforces no-+' digits via Zod (whatsappNumberRegex).
//
// Returns null if `whatsappNumber` is null/empty (vendor has no WhatsApp).

export function buildWhatsappUrl(whatsappNumber: string | null, text: string): string | null {
  if (!whatsappNumber || whatsappNumber.trim() === '') {
    return null;
  }

  // Defensive — strip any non-digit chars just in case (the Zod regex
  // already enforces digits-only, but be paranoid about manually-edited data)
  const cleanNumber = whatsappNumber.replace(/\D/g, '');
  if (!cleanNumber) return null;

  const encodedText = encodeURIComponent(text);
  return `https://wa.me/${cleanNumber}?text=${encodedText}`;
}
