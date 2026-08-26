/**
 * Type-safe access to Vite env variables.
 *
 * Vite replaces `import.meta.env.VITE_*` at build time. Anything not
 * prefixed with `VITE_` is hidden from the client bundle (security: server
 * secrets can never leak to the browser).
 *
 * Add new public env vars here as you introduce them. Validate at the
 * boundary so callers don't have to worry about `undefined`.
 */

function required(name: string, fallback: string): string {
  const v = import.meta.env[`VITE_${name}`];
  if (typeof v === 'string' && v.length > 0) return v;
  return fallback;
}

export const env = {
  /** Backend API base URL. Must NOT have a trailing slash. */
  apiBaseUrl: required('API_BASE_URL', 'http://localhost:3000').replace(/\/$/, ''),
} as const;

export type Env = typeof env;
