/** Shared startup path; no React state or backend request before first paint. */
export function applyThemeEarly(): void {
  try {
    const raw = localStorage.getItem('themeSettings');
    const saved = raw ? JSON.parse(raw) : null;
    document.documentElement.setAttribute('data-bs-theme', saved?.mode || 'dark');
    document.documentElement.setAttribute('data-bs-core', saved?.halfmoonCore || 'default');
    if (saved?.primaryColor) document.documentElement.style.setProperty('--primary', saved.primaryColor);
    if (saved?.secondaryColor) document.documentElement.style.setProperty('--secondary', saved.secondaryColor);
    if (saved?.accentColor) document.documentElement.style.setProperty('--accent', saved.accentColor);
  } catch {
    document.documentElement.setAttribute('data-bs-theme', 'dark');
    document.documentElement.setAttribute('data-bs-core', 'default');
  }
}
