import { createContext, useEffect, useMemo, useState, useCallback, type ReactNode } from 'react';

import { api } from '@/lib/api';
import { tokenStore, setLogoutHandler } from '@/lib/token-store';
import type { LoginResponse, MeResponse, PublicUser } from '@/types/user';

// ─── Types ──────────────────────────────────────────────────────────

export interface AuthState {
  /** The logged-in user, or null if not authenticated. */
  user: PublicUser | null;
  /** True if the access token is in memory (sessionStorage). Note that
   *  the user object might still be null while `isInitializing` is true
   *  (we're fetching /auth/me). */
  isAuthenticated: boolean;
  /** True during the initial hydration (first /auth/me call). Subsequent
   *  logins/logout do NOT flip this — it's a one-shot boot flag. */
  isInitializing: boolean;
  /** Login with email + password. Throws ApiError on 401/400. */
  login: (email: string, password: string) => Promise<PublicUser>;
  /** Logout — clears token + cookie + React state. */
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | undefined>(undefined);

// ─── Provider ───────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // Subscribe to tokenStore so React re-renders when the token changes
  // (e.g. after refresh-token rotation in the axios interceptor).
  const [hasToken, setHasToken] = useState<boolean>(() => tokenStore.get() !== null);

  useEffect(() => {
    const unsubscribe = tokenStore.subscribe((token) => {
      setHasToken(token !== null);
    });
    return unsubscribe;
  }, []);

  // ─── Hydrate on mount ────────────────────────────────────────────
  // Restore the session: load any token from sessionStorage, then call
  // /auth/me to fetch the user object. If either step fails, clear and
  // treat as logged out.
  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const token = tokenStore.hydrate();
      if (!token) {
        if (!cancelled) setIsInitializing(false);
        return;
      }

      try {
        const data = (await api.get<MeResponse>('/auth/me')) as MeResponse;
        if (!cancelled) {
          setUser(data.user);
        }
      } catch {
        // Token is invalid or expired and refresh also failed — clear.
        tokenStore.clear();
        tokenStore.persist(null);
      } finally {
        if (!cancelled) setIsInitializing(false);
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Register the logout handler ────────────────────────────────
  // The axios 401 interceptor calls `triggerLogout()` when refresh
  // also fails. We need React state to stay in sync, so we register a
  // callback that clears the user.
  useEffect(() => {
    setLogoutHandler(async () => {
      setUser(null);
      // Best-effort: tell the backend to clear the refresh cookie.
      try {
        await api.post('/auth/logout', {});
      } catch {
        // Already unauthenticated — ignore.
      }
    });
    return () => setLogoutHandler(null);
  }, []);

  // ─── login ───────────────────────────────────────────────────────
  const login = useCallback(async (email: string, password: string) => {
    const data = (await api.post<LoginResponse>('/auth/login', {
      email,
      password,
    })) as LoginResponse;
    tokenStore.set(data.accessToken);
    tokenStore.persist(data.accessToken);
    setUser(data.user);
    return data.user;
  }, []);

  // ─── logout ──────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout', {});
    } catch {
      // Even if the network call fails, clear local state.
    }
    tokenStore.clear();
    tokenStore.persist(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      isAuthenticated: hasToken && user !== null,
      isInitializing,
      login,
      logout,
    }),
    [user, hasToken, isInitializing, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
