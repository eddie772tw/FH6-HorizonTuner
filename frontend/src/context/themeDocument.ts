import { CORE_THEMES } from './themeCatalog';
import { themeColorProperties, type ThemeSettings } from './themeSettings';

/** First paint and React use the same core -> design system mapping. */
export function applyThemeToDocument(theme: ThemeSettings): void {
  const root = document.documentElement;
  root.setAttribute('data-bs-theme', theme.mode);
  // Keep the existing core attribute and serialized field for saved/custom themes.
  root.setAttribute('data-bs-core', theme.halfmoonCore);
  root.setAttribute('data-design-system', CORE_THEMES[theme.halfmoonCore].designSystem);
  // Older versions set this inline. Component effects now belong to system CSS.
  root.style.removeProperty('--primary-glow');
  for (const [property, value] of Object.entries(themeColorProperties(theme))) {
    root.style.setProperty(property, value);
  }
}
