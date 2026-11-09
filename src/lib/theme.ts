import { useSyncExternalStore } from 'react';

/**
 * Light (the printed plate), dark (the atlas at night) or toy (a toy diorama). The inline script in
 * index.html sets `data-theme` on <html> before first paint; this module keeps it
 * in sync afterwards. With no explicit choice the theme follows the system.
 */
export type Theme = 'light' | 'dark' | 'toy';

const KEY = 'atlas-theme';
const META = { light: '#F3EDDE', dark: '#0F1B17', toy: '#F7E4C8' };
const listeners = new Set<() => void>();

const systemQuery = () => window.matchMedia('(prefers-color-scheme: dark)');
const systemTheme = (): Theme => (systemQuery().matches ? 'dark' : 'light');

function stored(): Theme | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' || v === 'toy' ? v : null;
  } catch {
    return null;
  }
}

export function currentTheme(): Theme {
  const t = document.documentElement.dataset.theme;
  return t === 'dark' || t === 'toy' ? t : 'light';
}

function apply(t: Theme) {
  if (currentTheme() === t && document.documentElement.dataset.theme) return;
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META[t]);
  listeners.forEach((l) => l());
}

/** An explicit choice is remembered; choosing what the system already shows goes back to following it. */
export function setTheme(t: Theme) {
  try {
    if (t === systemTheme()) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, t);
  } catch {
    // Storage unavailable: the choice lasts for this page only.
  }
  apply(t);
}

let watching = false;
function subscribe(l: () => void) {
  listeners.add(l);
  if (!watching) {
    watching = true;
    systemQuery().addEventListener('change', () => {
      if (!stored()) apply(systemTheme());
    });
  }
  return () => {
    listeners.delete(l);
  };
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, currentTheme, () => 'light');
}
