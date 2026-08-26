/**
 * API response envelope — matches the backend's `sendSuccess` / global error
 * handler shape (see `rizqun/src/utils/response.ts` + `rizqun/src/app.ts`).
 *
 * Every successful response is:
 *   { success: true, message: string, data: T }
 *
 * Every error response is:
 *   { success: false, message: string, code?: string }
 *
 * The axios response interceptor in `src/lib/api.ts` unwraps the success
 * envelope so callers receive the inner `T` directly. On failure, it throws
 * an `ApiError` instance (below) so callers can `try/catch` cleanly.
 */

export interface ApiResponseSuccess<T> {
  success: true;
  message: string;
  data: T;
}

export interface ApiResponseError {
  success: false;
  message: string;
  code?: string;
}

export type ApiResponse<T> = ApiResponseSuccess<T> | ApiResponseError;

// ─── Typed API error ───────────────────────────────────────────────

export interface ApiErrorData {
  message: string;
  code?: string;
  /** HTTP status from the original axios error. */
  status: number;
  /** Raw axios response (for advanced handling). */
  raw?: unknown;
}

/**
 * Error thrown by the axios response interceptor when the API returns
 * `success: false` OR when the request fails entirely (network error, 5xx).
 *
 * Use `instanceof ApiError` in catch blocks to distinguish API errors from
 * unexpected runtime errors.
 */
export class ApiError extends Error {
  public readonly code?: string;
  public readonly status: number;
  public readonly raw?: unknown;

  constructor(data: ApiErrorData) {
    super(data.message);
    this.name = 'ApiError';
    this.code = data.code;
    this.status = data.status;
    this.raw = data.raw;
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  /** True if the error is a 401 (unauthorized). */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  /** True if the error is a 403 (forbidden). */
  get isForbidden(): boolean {
    return this.status === 403;
  }

  /** True if the error is a 429 (rate-limited). */
  get isRateLimited(): boolean {
    return this.status === 429;
  }

  /** True if the error is a validation error (400 with field info). */
  get isValidation(): boolean {
    return this.status === 400;
  }

  /** True if the error is a 404 (not found). */
  get isNotFound(): boolean {
    return this.status === 404;
  }
}
