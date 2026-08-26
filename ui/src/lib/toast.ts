import { toast as sonnerToast } from 'sonner';

import { ApiError } from '@/types/api';

/**
 * Toast helpers — consistent wrappers around sonner.
 *
 * Usage:
 *   import { toast } from '@/lib/toast'
 *   toast.success('Order created')
 *   toast.error('Something went wrong')
 *   toast.apiError(error)   // friendly message based on ApiError status
 */

export const toast = {
  success: (msg: string) => sonnerToast.success(msg),
  error: (msg: string) => sonnerToast.error(msg),
  info: (msg: string) => sonnerToast.info(msg),
  warning: (msg: string) => sonnerToast.warning(msg),

  /**
   * Toast an ApiError with a friendly, status-aware message.
   * Falls back to the raw error message if not an ApiError.
   */
  apiError(error: unknown) {
    if (error instanceof ApiError) {
      // 0 — network/CORS error (no response from server at all).
      // Two common causes:
      //   1. Backend not running → start it with `npm start` in the
      //      rizqun root folder (D:\DeveloperHub\rizqun)
      //   2. CORS origin mismatch → user opened the app at
      //      http://127.0.0.1:5173 instead of http://localhost:5173
      if (error.status === 0) {
        sonnerToast.error(
          "Couldn't reach the backend. Start it with: cd D:\\DeveloperHub\\rizqun && npm start",
          {
            description: 'Also make sure you opened http://localhost:5173 (not 127.0.0.1).',
            duration: 8000,
          },
        );
        return;
      }
      // 429 — rate limited (e.g. 5 wrong passwords in 15 min on /auth/login)
      if (error.isRateLimited) {
        sonnerToast.error('Too many attempts. Please try again in 15 minutes.');
        return;
      }
      // 401 — invalid credentials / unauthenticated
      if (error.isUnauthorized) {
        sonnerToast.error('Invalid email or password.');
        return;
      }
      // 403 — forbidden (e.g. account deactivated)
      if (error.isForbidden) {
        sonnerToast.error('You do not have permission to do this.');
        return;
      }
      // 404 — not found
      if (error.isNotFound) {
        sonnerToast.error('Not found.');
        return;
      }
      // 400 — validation error (backend message is usually descriptive)
      if (error.isValidation) {
        sonnerToast.error(error.message);
        return;
      }
      // 5xx — genuine server error (the backend returned an error status)
      sonnerToast.error('Server error. Please try again in a moment.');
      return;
    }
    // Unexpected runtime error
    sonnerToast.error(error instanceof Error ? error.message : 'Something went wrong.');
  },
};

// Re-export the underlying sonner for advanced usage (e.g. toast.promise)
export { sonnerToast };
