export interface HudStyleEntry {
  id: string;
  source: 'builtin' | 'user';
  urlPrefix: string;
}

export interface HudDropdownOption {
  value: string;
  label: string;
  isCustom: boolean;
}

export const HUD_DISPLAY_NAMES: Record<string, string> = {
  advanced: 'Race Arc',
  simple: 'Simple',
  fm4ui: 'Forza Motorsport 4',
  gt7: 'GT7',
  mw2005: "NFS Most Wanted '05",
  nfs15: "NFS '15",
  shift_tacho: 'NFS Shift',
  vfd: 'Retro VFD',
  drift: 'Drift HUD',
};

/**
 * Fetch dynamic HUD style list from backend API
 */
export async function fetchHudStylesList(baseUrl: string, fetchFn: typeof fetch = fetch): Promise<HudStyleEntry[]> {
  try {
    const res = await fetchFn(`${baseUrl}/api/hud/styles`);
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.styles)) {
        return data.styles;
      }
    }
  } catch (e) {
    console.warn('Failed to fetch dynamic HUD styles:', e);
  }
  return [];
}

/**
 * Convert HudStyleEntry array to UI dropdown option objects
 */
export function formatHudDropdownOptions(
  hudStyles: HudStyleEntry[],
  displayNames: Record<string, string> = HUD_DISPLAY_NAMES
): HudDropdownOption[] {
  if (!hudStyles || hudStyles.length === 0) {
    return Object.entries(displayNames).map(([id, label]) => ({
      value: id,
      label,
      isCustom: false,
    }));
  }

  return hudStyles.map((s) => ({
    value: s.id,
    label: s.source === 'user' ? `[Custom] ${s.id}` : (displayNames[s.id] ?? s.id),
    isCustom: s.source === 'user',
  }));
}

/**
 * Get static URL prefix for a HUD style name
 */
export function getHudUrlPrefix(hudStyles: HudStyleEntry[], styleName: string): string {
  const entry = hudStyles.find((s) => s.id === styleName);
  return entry ? entry.urlPrefix : '/hud';
}
