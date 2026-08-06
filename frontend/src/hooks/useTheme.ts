// ─────────────────────────────────────────────────────────────────────────────
// src/hooks/useTheme.ts
// Presentation-only light/dark control. Persists to localStorage and follows
// the OS until the user makes an explicit choice.
// The pre-paint class is set by the inline script in index.html.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'elevate-theme';

function resolveInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(resolveInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      window.localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return { theme, setTheme, toggleTheme, isDark: theme === 'dark' };
}
