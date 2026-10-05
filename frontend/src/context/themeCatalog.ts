/** A core selects a palette and a component design system; presets only change accents. */
export const DESIGN_SYSTEMS = {
  halfmoon: { label: 'Halfmoon' },
  swiss: { label: 'Swiss' },
} as const;

export type DesignSystemId = keyof typeof DESIGN_SYSTEMS;

interface CoreThemeDefinition {
  label: string;
  description: string;
  designSystem: DesignSystemId;
  swatchPrimary: string;
  swatchBg: string;
}

export const CORE_THEMES = {
  default: {
    label: 'Default', designSystem: 'halfmoon',
    description: 'Classic neutral tone with clean structure',
    swatchPrimary: '#4dabf7', swatchBg: '#1a1c23',
  },
  modern: {
    label: 'Modern', designSystem: 'halfmoon',
    description: 'Slate-tinted dark with navy blue accent',
    swatchPrimary: '#3b5bdb', swatchBg: '#1e2a3a',
  },
  elegant: {
    label: 'Elegant', designSystem: 'halfmoon',
    description: 'Warm earth tones with refined typography',
    swatchPrimary: '#a07850', swatchBg: '#1c1a18',
  },
  swiss: {
    label: 'Swiss Technical', designSystem: 'swiss',
    description: 'High-contrast grid with objective typography and matte instruments',
    swatchPrimary: '#e30613', swatchBg: '#0b0d12',
  },
} as const satisfies Record<string, CoreThemeDefinition>;

export type CoreThemeId = keyof typeof CORE_THEMES;

export const isCoreTheme = (value: unknown): value is CoreThemeId => (
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(CORE_THEMES, value)
);

export const coreThemeEntries = Object.entries(CORE_THEMES) as [CoreThemeId, CoreThemeDefinition][];
