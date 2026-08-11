import React, { createContext, useContext, useState, useEffect } from 'react';
import { backendFetch } from '../services/backend';

export type HalfmoonCore = 'default' | 'modern' | 'elegant';

export interface ThemeSlot {
  id: number;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  mode: 'dark' | 'light';
  halfmoonCore: HalfmoonCore;
  customCSS: string;
  savedAt?: string;
}

export interface ThemeSettings {
  mode: 'dark' | 'light';
  halfmoonCore: HalfmoonCore;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  customCSS: string;
  slots: ThemeSlot[];
}

export const defaultThemeSettings: ThemeSettings = {
  mode: 'dark',
  halfmoonCore: 'default',
  primaryColor: '#00f0ff',
  secondaryColor: '#ff003c',
  accentColor: '#7000ff',
  customCSS: '',
  slots: [
    { id: 1, name: 'Slot 1', primaryColor: '#00f0ff', secondaryColor: '#ff003c', accentColor: '#7000ff', mode: 'dark', halfmoonCore: 'default', customCSS: '' },
    { id: 2, name: 'Slot 2', primaryColor: '#4f8ef7', secondaryColor: '#f59e0b', accentColor: '#8b5cf6', mode: 'dark', halfmoonCore: 'modern', customCSS: '' },
    { id: 3, name: 'Slot 3', primaryColor: '#d4a96a', secondaryColor: '#7c9e6e', accentColor: '#a07850', mode: 'dark', halfmoonCore: 'elegant', customCSS: '' },
  ]
};

export const getDefaultCSSTemplate = (settings: ThemeSettings): string => {
  return `/* FH6-HorizonTuner Active Theme Style Template
 * This app uses Halfmoon CSS v2.0.2 as the base framework.
 * Theme is controlled by: data-bs-theme (dark|light) + data-bs-core (default|modern|elegant)
 *
 * --- Halfmoon Semantic Variables (read-only, auto-adapt to theme/mode) ---
 * --bs-body-color         : Main text color
 * --bs-secondary-color    : Secondary text / muted text
 * --bs-body-bg            : Page background color
 * --bs-body-bg-hsl        : Page background in HSL (for rgba transparency)
 * --bs-secondary-bg       : Subtle background (cards, sidebars)
 * --bs-tertiary-bg        : Input/form background
 * --bs-border-color       : Default border color
 * --bs-border-color-translucent : Translucent border
 * --bs-primary            : Halfmoon primary color (changes with data-bs-core)
 * --bs-primary-hsl        : Primary color in HSL
 *
 * --- FH6 Custom Variables (mapped from Halfmoon or standalone) ---
 * --primary               : Brand accent color (neon/user-defined)
 * --secondary             : Secondary accent color
 * --accent                : Tertiary accent color
 * --primary-glow          : Glow shadow for primary
 * --glass-bg              : Glassmorphism panel background
 * --glass-border          : Glassmorphism panel border
 * --glass-blur            : Backdrop blur radius
 * --panel-radius          : Card corner radius
 * --input-radius          : Input field corner radius
 * --text-primary          : Mapped from --bs-body-color
 * --text-secondary        : Mapped from --bs-secondary-color
 *
 * --- Target Selectors ---
 * .glass-panel            : Main content panels
 * .cyber-input            : Text inputs & textareas
 * .cyber-select           : Dropdown selects
 * .cyber-btn-glow         : Interactive glow buttons
 * [data-bs-theme="dark"]  : Dark mode root target
 * [data-bs-theme="light"] : Light mode root target
 * [data-bs-core="default"]: Default (cyan) core theme
 * [data-bs-core="modern"] : Modern (navy) core theme
 * [data-bs-core="elegant"]: Elegant (earth) core theme
 */

:root {
  --primary: ${settings.primaryColor};
  --secondary: ${settings.secondaryColor};
  --accent: ${settings.accentColor};
  --primary-glow: rgba(0, 240, 255, 0.25);
  --glass-blur: 12px;
  --panel-radius: 16px;
  --input-radius: 6px;
}

/* Glassmorphism Panel Customization */
.glass-panel {
  backdrop-filter: blur(var(--glass-blur));
  border-radius: var(--panel-radius);
}

/* Cyber Button Custom Accent */
.cyber-btn-glow {
  transition: all 0.25s ease;
}`;
};

interface ThemeContextType {
  themeSettings: ThemeSettings;
  updateThemeSettings: (updates: Partial<ThemeSettings>) => void;
  resetTheme: () => void;
  saveToSlot: (slotId: number, slotName?: string) => void;
  loadFromSlot: (slotId: number) => void;
  exportThemeJSON: () => string;
  importThemeJSON: (jsonString: string) => boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeSettings, setThemeSettings] = useState<ThemeSettings>(() => {
    const saved = localStorage.getItem('themeSettings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...defaultThemeSettings,
          ...parsed,
          halfmoonCore: parsed.halfmoonCore || 'default',
          slots: parsed.slots && parsed.slots.length > 0 ? parsed.slots.map((s: Partial<ThemeSlot>) => ({
            ...s,
            halfmoonCore: s.halfmoonCore || 'default'
          })) : defaultThemeSettings.slots
        };
      } catch (e) {
        console.error('Failed to parse theme settings from local storage', e);
      }
    }
    return defaultThemeSettings;
  });

  // Fetch backend settings on startup
  useEffect(() => {
    const fetchBackendTheme = async () => {
      try {
        const res = await backendFetch('/api/settings');
        const data = await res.json();
        if (data && data.theme) {
          setThemeSettings(prev => ({
            ...defaultThemeSettings,
            ...prev,
            ...data.theme,
            halfmoonCore: data.theme.halfmoonCore || prev.halfmoonCore || 'default',
            slots: data.theme.slots && data.theme.slots.length > 0 ? data.theme.slots : (prev.slots || defaultThemeSettings.slots)
          }));
        }
      } catch (e) {
        console.error('Failed to fetch theme settings from backend', e);
      }
    };
    fetchBackendTheme();
  }, []);

  useEffect(() => {
    // Apply Halfmoon theme attributes (replaces manual data-theme system)
    document.documentElement.setAttribute('data-bs-theme', themeSettings.mode || 'dark');
    document.documentElement.setAttribute('data-bs-core', themeSettings.halfmoonCore || 'default');

    // Inject user-defined brand colors as CSS custom properties
    // These override the defaults set in App.css, allowing full user customization
    document.documentElement.style.setProperty('--primary', themeSettings.primaryColor);
    document.documentElement.style.setProperty('--secondary', themeSettings.secondaryColor);
    document.documentElement.style.setProperty('--accent', themeSettings.accentColor);
    document.documentElement.style.setProperty('--primary-glow', `rgba(${hexToRgb(themeSettings.primaryColor)}, 0.25)`);

    // Inject custom CSS
    let styleTag = document.getElementById('custom-theme-css');
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = 'custom-theme-css';
      document.head.appendChild(styleTag);
    }
    styleTag.textContent = themeSettings.customCSS;

    // Save to LocalStorage
    localStorage.setItem('themeSettings', JSON.stringify(themeSettings));
  }, [themeSettings]);

  const syncToBackend = async (newSettings: ThemeSettings) => {
    try {
      await backendFetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: newSettings })
      });
    } catch (e) {
      console.error('Failed to sync theme settings to backend', e);
    }
  };

  const updateThemeSettings = (updates: Partial<ThemeSettings>) => {
    setThemeSettings(prev => {
      const updated = { ...prev, ...updates };
      syncToBackend(updated);
      return updated;
    });
  };

  const resetTheme = () => {
    setThemeSettings(defaultThemeSettings);
    syncToBackend(defaultThemeSettings);
  };

  const saveToSlot = (slotId: number, slotName?: string) => {
    setThemeSettings(prev => {
      const now = new Date().toLocaleTimeString();
      const updatedSlots = prev.slots.map(slot => {
        if (slot.id === slotId) {
          return {
            ...slot,
            name: slotName || slot.name,
            primaryColor: prev.primaryColor,
            secondaryColor: prev.secondaryColor,
            accentColor: prev.accentColor,
            mode: prev.mode,
            halfmoonCore: prev.halfmoonCore,
            customCSS: prev.customCSS,
            savedAt: now
          };
        }
        return slot;
      });
      const updated = { ...prev, slots: updatedSlots };
      syncToBackend(updated);
      return updated;
    });
  };

  const loadFromSlot = (slotId: number) => {
    const targetSlot = themeSettings.slots.find(s => s.id === slotId);
    if (targetSlot) {
      updateThemeSettings({
        primaryColor: targetSlot.primaryColor,
        secondaryColor: targetSlot.secondaryColor,
        accentColor: targetSlot.accentColor,
        mode: targetSlot.mode,
        halfmoonCore: targetSlot.halfmoonCore || 'default',
        customCSS: targetSlot.customCSS
      });
    }
  };

  const exportThemeJSON = (): string => {
    const exportData = {
      mode: themeSettings.mode,
      halfmoonCore: themeSettings.halfmoonCore,
      primaryColor: themeSettings.primaryColor,
      secondaryColor: themeSettings.secondaryColor,
      accentColor: themeSettings.accentColor,
      customCSS: themeSettings.customCSS,
      exportedAt: new Date().toISOString()
    };
    return JSON.stringify(exportData, null, 2);
  };

  const importThemeJSON = (jsonString: string): boolean => {
    try {
      const parsed = JSON.parse(jsonString);
      if (parsed.primaryColor && parsed.secondaryColor) {
        updateThemeSettings({
          mode: parsed.mode || 'dark',
          halfmoonCore: parsed.halfmoonCore || 'default',
          primaryColor: parsed.primaryColor,
          secondaryColor: parsed.secondaryColor,
          accentColor: parsed.accentColor || '#7000ff',
          customCSS: parsed.customCSS || ''
        });
        return true;
      }
    } catch (e) {
      console.error('Invalid theme JSON imported', e);
    }
    return false;
  };

  return (
    <ThemeContext.Provider value={{
      themeSettings,
      updateThemeSettings,
      resetTheme,
      saveToSlot,
      loadFromSlot,
      exportThemeJSON,
      importThemeJSON
    }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

// Helper: convert hex color to "r, g, b" string for use in rgba()
function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '0, 240, 255';
  return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
}
