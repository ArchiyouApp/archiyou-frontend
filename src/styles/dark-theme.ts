/**
 * Dark theme token overrides.
 *
 * Applied when:
 *  - <html data-theme="dark"> is set (manual toggle), OR
 *  - prefers-color-scheme: dark media query matches
 *
 * Call `applyDarkTheme()` on the manual toggle and
 * `removeDarkTheme()` to revert to light.
 */

import { applyDesignTokens } from './design-tokens.js';

const darkOverrides: Record<string, string> = {
  '--color-bg':          '#0f172a',  // neutral-900
  '--color-bg-elevated': '#1e293b',  // neutral-800
  '--color-bg-code':     '#1e293b',
  '--color-text':        '#f8fafc',  // neutral-50
  '--color-text-muted':  '#94a3b8',  // neutral-400
  '--color-border':      '#334155',  // neutral-700
};

export function applyDarkTheme(root: HTMLElement = document.documentElement): void {
  for (const [prop, value] of Object.entries(darkOverrides)) {
    root.style.setProperty(prop, value);
  }
  root.setAttribute('data-theme', 'dark');
}

export function removeDarkTheme(root: HTMLElement = document.documentElement): void {
  for (const prop of Object.keys(darkOverrides)) {
    root.style.removeProperty(prop);
  }
  root.removeAttribute('data-theme');
  // Re-apply light defaults for the overridden vars
  applyDesignTokens(root);
}

/** Returns true if dark mode is currently active. */
export function isDarkTheme(): boolean {
  return document.documentElement.getAttribute('data-theme') === 'dark';
}

/** Apply dark theme if OS prefers dark and no explicit override is set. */
export function applySystemTheme(): void {
  if (!document.documentElement.hasAttribute('data-theme')) {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      applyDarkTheme();
    }
  }
}
