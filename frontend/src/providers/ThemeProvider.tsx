'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { theme_storage_key } from '@/lib/theme/themeStorage';

/** The three theme states. `system` follows the OS preference. */
export type ThemeMode = 'system' | 'dark' | 'light';

/** What the theme provider exposes. */
export interface ThemeContextValue {
  mode: ThemeMode;
  set_mode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const listeners = new Set<() => void>();

/**
 * Reads the stored choice, tolerating a browser that refuses storage.
 *
 * @returns The stored mode, or `system`.
 */
function read_stored_mode(): ThemeMode {
  try {
    const stored = window.localStorage.getItem(theme_storage_key);
    return stored === 'dark' || stored === 'light' ? stored : 'system';
  } catch {
    return 'system';
  }
}

/**
 * Subscribes to theme changes made through {@link write_mode}.
 *
 * @param on_change - Called after every write.
 * @returns The unsubscribe function.
 */
function subscribe(on_change: () => void): () => void {
  listeners.add(on_change);
  return () => listeners.delete(on_change);
}

/**
 * Stamps a mode on the root element. `system` removes the stamp so the media query decides.
 *
 * @param mode - The mode to apply.
 */
function apply_mode(mode: ThemeMode): void {
  const root = document.documentElement;
  if (mode === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', mode);
  }
}

/**
 * Applies the choice, persists it, and tells subscribers.
 *
 * @param mode - The mode to apply.
 */
function write_mode(mode: ThemeMode): void {
  apply_mode(mode);
  try {
    window.localStorage.setItem(theme_storage_key, mode);
  } catch {
    // A private window may refuse storage; the choice still applies for this page.
  }
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Provides the theme choice and persists it.
 *
 * The initial paint is handled by a tiny inline script in the root layout, which reads the same
 * key before hydration. Once hydrated, the provider stamps the stored choice on the root element
 * again, so a page whose inline script did not run still ends up in the chosen theme. It reads
 * storage as an external store, so the server render reports `system` and the client snapshot
 * takes over after hydration without a state update inside an effect.
 *
 * @param props - The subtree.
 * @returns The provider.
 */
export function ThemeProvider({ children }: { children: ReactNode }): ReactNode {
  const mode = useSyncExternalStore(subscribe, read_stored_mode, () => 'system' as ThemeMode);
  const set_mode = useCallback((next: ThemeMode) => write_mode(next), []);
  const value = useMemo(() => ({ mode, set_mode }), [mode, set_mode]);

  useEffect(() => {
    // Reads storage rather than `mode`, which still holds the server snapshot in the hydrating render.
    apply_mode(read_stored_mode());
  }, []);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Reads the theme choice.
 *
 * @returns The current mode and the setter.
 * @throws {Error} When used outside the provider.
 */
export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (value === null) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }
  return value;
}
