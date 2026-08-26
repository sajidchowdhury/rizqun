import { useContext } from 'react';

import { AuthContext, type AuthState } from '@/contexts/auth-provider';

/**
 * Access the auth context. Throws if used outside `<AuthProvider>`.
 *
 * Usage:
 *   const { user, isAuthenticated, isInitializing, login, logout } = useAuth()
 */
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
