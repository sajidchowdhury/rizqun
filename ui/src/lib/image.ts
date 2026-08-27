import { env } from './env';

/**
 * Build the full URL for a product image.
 *
 * The backend stores image paths as `/uploads/products/xxx.jpg` (relative).
 * In dev, the UI is on port 5173 and the backend is on port 3000, so we
 * need to prepend the backend's base URL. In production, Nginx serves
 * both the UI and the API on the same domain, so the relative path works
 * as-is (but prepending the API URL is harmless because it's the same
 * origin).
 *
 * @param imageUrl - The relative path from the backend (e.g. "/uploads/products/rice.jpg")
 * @returns Full URL, or null if no image
 */
export function imageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;
  // If it's already a full URL (https://...), return as-is
  if (imageUrl.startsWith('http')) return imageUrl;
  // Otherwise, prepend the backend API base URL
  return `${env.apiBaseUrl}${imageUrl}`;
}
