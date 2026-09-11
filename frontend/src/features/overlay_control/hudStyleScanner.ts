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

export interface HudStyleFetchOptions {
  strict?: boolean;
  timeoutMs?: number;
}

export const HUD_DISPLAY_NAMES: Record<string, string> = {
  vfd: 'Retro VFD',
  drift: 'Drift HUD',
  s650_hmi: 'Ford Mustang HMI',
  advanced: 'Advanced Racing Arc',
  fm4ui: 'Forza Motorsport 4',
  gt7: 'Gran Turismo 7',
  mw2005: "NFS Most Wanted 2005",
  nfs15: "Need for Speed 2015",
  shift_tacho: 'Need for Speed Shift',
  simple: 'Simple Gauge',
  defi_triple: 'Defi Advance BF',
  initial_d: 'Initial D AE86 TRD',
};

/**
 * HUD styles currently in progress (WIP) and excluded from the public dropdown by default.
 */
export const WIP_HUD_DISPLAY_NAMES: Record<string, string> = {
  motec_gt3: 'MoTeC C125 GT3 (WIP)',
  fh5_arc: 'Forza Horizon 5 (WIP)',
  cyberpunk_hud: 'Cyberpunk 2077 Quadra (WIP)',
};

export const WIP_HUD_IDS: ReadonlySet<string> = new Set(Object.keys(WIP_HUD_DISPLAY_NAMES));

/**
 * Checks if WIP / Developer HUDs are requested via URL query string (?wip=1, ?dev=1, etc.).
 */
export function isWipHudQueryEnabled(search: string = typeof window !== 'undefined' ? window.location?.search ?? '' : ''): boolean {
  if (!search) return false;
  try {
    const params = new URLSearchParams(search);
    return (
      params.get('wip') === '1' ||
      params.get('wip') === 'true' ||
      params.get('dev') === '1' ||
      params.get('dev') === 'true'
    );
  } catch {
    return false;
  }
}

const HUD_DISPLAY_PRIORITY: Readonly<Record<string, number>> = {
  vfd: 0,
  drift: 1,
  s650_hmi: 2,
};

/**
 * Fetch dynamic HUD style list from backend API
 */
export async function fetchHudStylesList(
  baseUrl: string,
  fetchFn: typeof fetch = fetch,
  options: HudStyleFetchOptions = {},
): Promise<HudStyleEntry[]> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 10_000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(
      `${baseUrl.replace(/\/$/, '')}/api/hud/styles`,
      { signal: controller.signal },
    );
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.styles)) {
        return data.styles;
      }
    }
    if (options.strict) {
      throw new Error(`HUD styles request failed (HTTP ${res.status}).`);
    }
  } catch (e) {
    console.warn('Failed to fetch dynamic HUD styles:', e);
    if (options.strict) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        throw new Error(`HUD styles request timed out after ${timeoutMs}ms.`);
      }
      throw e;
    }
  } finally {
    clearTimeout(timeout);
  }
  return [];
}

export interface FormatHudDropdownOptionsConfig {
  includeWip?: boolean;
  currentStyle?: string;
  wipDisplayNames?: Record<string, string>;
}

/**
 * Convert HudStyleEntry array to UI dropdown option objects.
 * Excludes WIP styles unless includeWip is true or currentStyle matches.
 */
export function formatHudDropdownOptions(
  hudStyles: HudStyleEntry[],
  displayNames: Record<string, string> = HUD_DISPLAY_NAMES,
  options: FormatHudDropdownOptionsConfig = {}
): HudDropdownOption[] {
  const {
    includeWip = false,
    currentStyle,
    wipDisplayNames = WIP_HUD_DISPLAY_NAMES,
  } = options;

  if (!hudStyles || hudStyles.length === 0) {
    const baseList = Object.entries(displayNames).map(([id, label]) => ({
      value: id,
      label,
      isCustom: false,
    }));

    if (includeWip) {
      const wipList = Object.entries(wipDisplayNames).map(([id, label]) => ({
        value: id,
        label,
        isCustom: false,
      }));
      return [...baseList, ...wipList];
    }

    if (currentStyle && wipDisplayNames[currentStyle] && !displayNames[currentStyle]) {
      return [
        ...baseList,
        { value: currentStyle, label: wipDisplayNames[currentStyle], isCustom: false },
      ];
    }

    return baseList;
  }

  return hudStyles
    .filter((s) => {
      if (s.source === 'user') return true;
      if (WIP_HUD_IDS.has(s.id)) {
        return includeWip || currentStyle === s.id;
      }
      return true;
    })
    .map((s, index) => ({ s, index }))
    .sort(({ s: left, index: leftIndex }, { s: right, index: rightIndex }) => {
      const leftPriority = left.source === 'builtin' ? HUD_DISPLAY_PRIORITY[left.id] : undefined;
      const rightPriority = right.source === 'builtin' ? HUD_DISPLAY_PRIORITY[right.id] : undefined;
      if (leftPriority !== undefined || rightPriority !== undefined) {
        return (leftPriority ?? Number.MAX_SAFE_INTEGER) - (rightPriority ?? Number.MAX_SAFE_INTEGER);
      }
      return leftIndex - rightIndex;
    })
    .map(({ s }) => {
      let label: string;
      if (s.source === 'user') {
        label = `[Custom] ${s.id}`;
      } else if (displayNames[s.id]) {
        label = displayNames[s.id];
      } else if (wipDisplayNames[s.id]) {
        label = wipDisplayNames[s.id];
      } else {
        label = s.id;
      }

      return {
        value: s.id,
        label,
        isCustom: s.source === 'user',
      };
    });
}

/**
 * Get static URL prefix for a HUD style name
 */
export function getHudUrlPrefix(hudStyles: HudStyleEntry[], styleName: string): string {
  const entry = hudStyles.find((s) => s.id === styleName);
  return entry ? entry.urlPrefix : '/hud';
}
