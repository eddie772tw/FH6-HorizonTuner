import { normalizeThemeSettings, themeColorProperties } from '../context/themeSettings';

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
  for (const [property, value] of Object.entries(themeColorProperties(theme))) {
    document.documentElement.style.setProperty(property, value);
  }
}
