import { isCoreTheme } from '../../context/themeCatalog';
import { defaultThemeSettings, normalizeThemeSettings, type ThemeSettings } from '../../context/themeSettings';

export type CompanionVisualTheme = Pick<ThemeSettings, 'mode' | 'halfmoonCore' | 'primaryColor' | 'secondaryColor' | 'accentColor'> & { schemaVersion: 1 };
export const MAX_VISUAL_THEME_BYTES = 1024;
export const COMPANION_THEME_CACHE = 'companionVisualTheme/v1';
const keys = ['schemaVersion', 'mode', 'halfmoonCore', 'primaryColor', 'secondaryColor', 'accentColor'];

/** Atomic validation: partial, oversized and executable payloads never alter the last theme. */
export function parseCompanionVisualTheme(input: unknown): CompanionVisualTheme | null {
  try {
    const raw = typeof input === 'string' ? input : JSON.stringify(input);
    if (!raw || raw.length > MAX_VISUAL_THEME_BYTES) return null;
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).length !== keys.length || keys.some(key => !Object.prototype.hasOwnProperty.call(value, key))
      || value.schemaVersion !== 1 || !['light', 'dark'].includes(value.mode) || !isCoreTheme(value.halfmoonCore)
      || ['primaryColor', 'secondaryColor', 'accentColor'].some(key => typeof value[key] !== 'string' || !/^#[\da-f]{6}$/i.test(value[key]))) return null;
    const { customCSS: _css, ...visual } = normalizeThemeSettings({ ...value, customCSS: '' });
    return { schemaVersion: 1, ...visual };
  } catch { return null; }
}

export interface ThemeBootstrap { theme: ThemeSettings; generation?: string }
export function readCompanionThemeBootstrap(): ThemeBootstrap {
  try {
    const bridge = window.HorizonTunerCompanionTheme;
    if (bridge) {
      const raw = bridge.themeBootstrap?.();
      if (raw && raw.length <= 2048) {
        const value = JSON.parse(raw);
        const visual = parseCompanionVisualTheme(value.visualTheme);
        if (visual && value.origin === window.location.origin && typeof value.generation === 'string' && /^[\da-f-]{36}$/i.test(value.generation)) {
          return { theme: { ...visual, customCSS: '' }, generation: value.generation };
        }
      }
    } else {
      const visual = parseCompanionVisualTheme(localStorage.getItem(COMPANION_THEME_CACHE));
      if (visual) return { theme: { ...visual, customCSS: '' } };
    }
  } catch { /* Bootstrap failure retains the safe initial theme until authenticated refresh. */ }
  return { theme: { ...defaultThemeSettings, customCSS: '' } };
}

/** No settings POST; native accepts only the generation bound to this page load. */
export function receiveCompanionTheme(input: unknown, apply: (theme: ThemeSettings) => void, generation?: string): boolean {
  const visual = parseCompanionVisualTheme(input);
  if (!visual) return false;
  apply({ ...visual, customCSS: '' });
  try {
    if (window.HorizonTunerCompanionTheme) {
      if (generation) window.HorizonTunerCompanionTheme.updateVisualTheme(JSON.stringify(visual), generation);
    } else localStorage.setItem(COMPANION_THEME_CACHE, JSON.stringify(visual));
  } catch { /* Cache/bridge availability does not reset valid React state. */ }
  return true;
}
