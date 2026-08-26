import { createContext, useEffect, useMemo, useState, type ReactNode } from 'react';

// ─── Types ────────────────────────────────────────────────────────

export type Theme = 'light' | 'dark' | 'system';

export type ThemeProviderState = {
  theme: Theme;
  /** Resolved theme — never 'system'. Useful for components that need
   *  to know the actual active mode. */
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
};

const STORAGE_KEY = 'rizqun-ui-theme';

export const ThemeProviderContext = createContext<ThemeProviderState | undefined>(undefined);

// ─── Helpers ─────────────────────────────────────────────────────

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyThemeClass(resolved: 'light' | 'dark') {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(resolved);
}

// ─── Provider ─────────────────────────────────────────────────────

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = STORAGE_KEY,
}: {
  children: ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return defaultTheme;
    return (localStorage.getItem(storageKey) as Theme | null) ?? defaultTheme;
  });

  // Track OS theme so we can resolve 'system' correctly when it changes.
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(() => getSystemTheme());

  // Listen to OS theme changes (only relevant when theme === 'system')
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemTheme(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Resolve the actual active theme
  const resolvedTheme = useMemo<'light' | 'dark'>(
    () => (theme === 'system' ? systemTheme : theme),
    [theme, systemTheme],
  );

  // Apply theme to <html> and persist to localStorage whenever it changes
  useEffect(() => {
    applyThemeClass(resolvedTheme);
    localStorage.setItem(storageKey, theme);
  }, [theme, resolvedTheme, storageKey]);

  const setTheme = (next: Theme) => setThemeState(next);

  const value = useMemo<ThemeProviderState>(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme],
  );

  return <ThemeProviderContext.Provider value={value}>{children}</ThemeProviderContext.Provider>;
}
