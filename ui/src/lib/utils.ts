import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * `cn` — Tailwind class combiner.
 *
 * Merges clsx (conditional class names) with tailwind-merge (de-dupes
 * conflicting Tailwind utilities, last one wins).
 *
 * Usage:
 *   cn('p-4', condition && 'bg-red-500', 'p-6')  → 'p-6 bg-red-500'
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
