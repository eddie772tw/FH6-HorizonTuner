import { normalizeThemeSettings, primaryForeground } from '../context/themeSettings';

/** Shared startup path; no React state or backend request before first paint. */
export function applyThemeEarly(): void {
  let saved;
  try {
    const raw = localStorage.getItem('themeSettings');
    saved = raw ? JSON.parse(raw) : null;
  } catch { /* Invalid or unavailable storage uses the same defaults as React. */ }
  const theme = normalizeThemeSettings(saved);
  document.documentElement.setAttribute('data-bs-theme', theme.mode);
  document.documentElement.setAttribute('data-bs-core', theme.halfmoonCore);
  document.documentElement.style.setProperty('--primary', theme.primaryColor);
  document.documentElement.style.setProperty('--secondary', theme.secondaryColor);
  document.documentElement.style.setProperty('--accent', theme.accentColor);
  document.documentElement.style.setProperty('--on-primary', primaryForeground(theme.primaryColor));
  document.documentElement.style.setProperty('--primary-glow', theme.halfmoonCore === 'swiss'
    ? 'transparent' : `color-mix(in srgb, ${theme.primaryColor} 25%, transparent)`);
}
