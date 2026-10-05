import { normalizeThemeSettings } from '../context/themeSettings';
import { applyThemeToDocument } from '../context/themeDocument';

/** Shared startup path; no React state or backend request before first paint. */
export function applyThemeEarly(): void {
  let saved;
  try {
    const raw = localStorage.getItem('themeSettings');
    saved = raw ? JSON.parse(raw) : null;
  } catch { /* Invalid or unavailable storage uses the same defaults as React. */ }
  applyThemeToDocument(normalizeThemeSettings(saved));
}
