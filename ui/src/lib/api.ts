import axios, {
  type AxiosError,
  type AxiosHeaders,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';

import { env } from './env';
import { tokenStore, triggerLogout } from './token-store';
import { ApiError, type ApiResponse, type ApiResponseSuccess } from '@/types/api';

// ─── Instance ──────────────────────────────────────────────────────

/**
 * Pre-configured axios instance for the Rizqun backend.
 *
 * Usage:
 *   import { api } from '@/lib/api'
 *   const user = await api.get<User>('/auth/me')
 *   // → user is the unwrapped `data` field, typed as User
 *
 * On error, the response interceptor throws an `ApiError` (not a raw
 * AxiosError) so callers can `instanceof ApiError` and read `.status`,
 * `.code`, `.isUnauthorized`, etc.
 */
export const api: AxiosInstance = axios.create({
  baseURL: env.apiBaseUrl,
  withCredentials: true, // send the refresh-token cookie (HttpOnly)
  timeout: 15_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ─── Request interceptor: attach Authorization header ─────────────

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenStore.get();
  if (token) {
    // Axios 1.x: mutate the headers object directly.
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

// ─── Response interceptor: unwrap envelope + 401 refresh ─────────

interface RetryableConfig extends AxiosRequestConfig {
  _retry?: boolean;
}

let refreshPromise: Promise<string | null> | null = null;

/**
 * Refresh the access token by calling /auth/refresh.
 *
 * Uses `fetch()` (not the `api` axios instance) on purpose:
 *   - Avoids re-triggering our own request interceptor (which would attach
 *     the stale token — irrelevant for /auth/refresh, but cleaner).
 *   - Avoids the response interceptor (so this refresh call can't recurse
 *     into another refresh on 401).
 *   - Bypasses the axios module augmentation below, which would otherwise
 *     make the typed return value not match the runtime value.
 *
 * The refresh token is sent automatically via `credentials: 'include'`
 * (the backend sets it as an HttpOnly cookie on /auth/login).
 */
async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${env.apiBaseUrl}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        // 401 (cookie missing/invalid) or 5xx (server error) — either way,
        // the user needs to log in again.
        triggerLogout();
        return null;
      }

      const body = (await response.json()) as ApiResponse<{ accessToken: string }>;
      if (!body.success) {
        triggerLogout();
        return null;
      }

      const newToken = body.data.accessToken;
      tokenStore.set(newToken);
      tokenStore.persist(newToken);
      return newToken;
    } catch {
      triggerLogout();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

api.interceptors.response.use(
  // Success: unwrap the response envelope.
  (response) => {
    const body = response.data as ApiResponseSuccess<unknown> | undefined;

    // Backend always wraps successful JSON in { success, message, data }.
    // If it does, unwrap and return the inner data so callers receive `T`.
    if (body && typeof body === 'object' && 'success' in body && body.success) {
      return body.data as unknown;
    }

    // Non-envelope responses (e.g. /health, raw file downloads) pass through.
    return response.data;
  },

  // Error: convert to ApiError, attempt refresh on 401 once.
  async (error: AxiosError<ApiResponse<never>>) => {
    const original = error.config as RetryableConfig | undefined;
    const status = error.response?.status ?? 0;

    // ── 401 → try refresh once, then retry ───────────────────────
    if (status === 401 && original && !original._retry) {
      original._retry = true;

      const newToken = await refreshAccessToken();
      if (newToken) {
        // Re-attach the new token and retry the original request.
        // `original.headers` is typed as AxiosRequestHeaders in axios 1.x;
        // cast to AxiosHeaders for the .set() call.
        const headers = original.headers as AxiosHeaders;
        headers.set('Authorization', `Bearer ${newToken}`);
        return api.request(original);
      }
      // Refresh failed → triggerLogout already called inside refreshAccessToken.
    }

    // ── Convert to ApiError ───────────────────────────────────────
    const body = error.response?.data;

    // Distinguish a real network/CORS error (no response from server)
    // from a real 5xx (server returned an error status). The original
    // code used `status || 500` which conflated the two — a CORS
    // preflight failure (status 0) was surfaced as 500, and the toast
    // helper then said "Server error" — misleading because the
    // request never reached the backend. Now status 0 → 0, and the
    // toast helper checks for 0 explicitly with a more helpful message.
    let message: string;
    let statusCode: number;
    if (error.response) {
      // Server responded with an error status (4xx, 5xx, etc.)
      statusCode = error.response.status;
      message =
        (body &&
          typeof body === 'object' &&
          'message' in body &&
          (body as { message: string }).message) ||
        error.message ||
        `Request failed with status ${statusCode}`;
    } else {
      // No response — network error, CORS preflight block, or DNS failure.
      // Don't fake a 500; surface as 0 so the toast helper can show a
      // meaningful "couldn't reach the server" message.
      statusCode = 0;
      message = error.message || 'Network error';
    }

    const code =
      body && typeof body === 'object' && 'code' in body
        ? (body as { code?: string }).code
        : undefined;

    throw new ApiError({
      message,
      code,
      status: statusCode,
      raw: error,
    });
  },
);

// ─── Typed request helpers ─────────────────────────────────────────
//
// These wrap axios methods so the returned Promise resolves to the
// unwrapped `data` field (T) directly instead of the full AxiosResponse.
//
// The response interceptor at runtime returns `body.data`, so callers
// receive the inner `T`. This module augmentation aligns the TypeScript
// types with that runtime behaviour.

declare module 'axios' {
  export interface AxiosInstance {
    get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T>;
    delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T>;
    post<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>;
    put<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>;
    patch<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>;
  }
}
