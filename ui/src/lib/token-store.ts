/**
 * In-memory access-token store.
 *
 * Why a module-level store instead of React state?
 *   The axios request interceptor needs to read the current access token
 *   synchronously on every outgoing request. Putting it in React state
 *   would force every component to forward the token to the interceptor via
 *   closures — messy and re-creates the interceptor on every login/logout.
 *   A module-level store is a stable singleton both React and the
 *   interceptor can read/write to.
 *
 * Persistence:
 *   The AuthProvider (Phase 1.2) is responsible for hydrating this store
 *   from `sessionStorage` on mount and clearing it on logout. This keeps
 *   the token out of `localStorage` (more vulnerable to XSS) and only
 *   survives a tab refresh, not a tab close.
 *
 * Listeners:
 *   AuthProvider subscribes so it can re-render when the token changes
 *   (e.g. after a successful `/auth/refresh`).
 */

const STORAGE_KEY = 'rizqun-ui-access-token';

type Listener = (token: string | null) => void;

let currentToken: string | null = null;
let hydrated = false;
const listeners = new Set<Listener>();

function notify() {
  for (const listener of listeners) {
    listener(currentToken);
  }
}

export const tokenStore = {
  /** Returns the current in-memory access token, or null. */
  get(): string | null {
    return currentToken;
  },

  /** Sets a new access token and notifies listeners. */
  set(token: string | null): void {
    currentToken = token;
    notify();
  },

  /** Clears the token and notifies listeners. */
  clear(): void {
    currentToken = null;
    notify();
  },

  /**
   * Loads the token from sessionStorage into memory. Called once on app
   * boot by AuthProvider. Safe to call multiple times — only the first
   * call actually reads sessionStorage.
   */
  hydrate(): string | null {
    if (hydrated) return currentToken;
    hydrated = true;
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) currentToken = stored;
    } catch {
      // sessionStorage can throw in restricted iframes; ignore.
    }
    notify();
    return currentToken;
  },

  /**
   * Persists the current token to sessionStorage. Called by AuthProvider
   * after a successful login or refresh.
   */
  persist(token: string | null): void {
    try {
      if (token) sessionStorage.setItem(STORAGE_KEY, token);
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  },

  /** Subscribes to token changes; returns an unsubscribe function. */
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
} as const;

// ─── Logout hook (Phase 1.2 wires this up) ───────────────────────

let logoutHandler: (() => void) | null = null;

/**
 * Registers a callback invoked when the API client decides the user must
 * be logged out (e.g. refresh token also expired, or a 401 even after
 * retry). AuthProvider sets this so React state stays in sync.
 */
export function setLogoutHandler(handler: (() => void) | null): void {
  logoutHandler = handler;
}

export function triggerLogout(): void {
  tokenStore.clear();
  tokenStore.persist(null);
  logoutHandler?.();
}
