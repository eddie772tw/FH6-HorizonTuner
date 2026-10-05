import React, { createContext, useContext, useState, useEffect } from 'react';
import { backendFetch } from '../services/backend';
import { validateCSS } from '../utils/cssValidator';

import { defaultThemeSettings, normalizeThemeSettings, primaryForeground, type ThemeSettings } from './themeSettings';
export { defaultThemeSettings, normalizeThemeSettings, isHalfmoonCore } from './themeSettings';
export type { ThemeSettings, HalfmoonCore } from './themeSettings';

interface ThemeContextType {
  themeSettings: ThemeSettings;
  updateThemeSettings: (updates: Partial<ThemeSettings>) => void;
  exportThemeJSON: () => string;
  importThemeJSON: (jsonString: string) => boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeSettings, setThemeSettings] = useState<ThemeSettings>(() => {
    const saved = localStorage.getItem('themeSettings');
    if (saved) {
      try {
        return normalizeThemeSettings(JSON.parse(saved));
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
          setThemeSettings(prev => normalizeThemeSettings(data.theme, prev));
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
    document.documentElement.style.setProperty('--on-primary', primaryForeground(themeSettings.primaryColor));
    document.documentElement.style.setProperty('--secondary', themeSettings.secondaryColor);
    document.documentElement.style.setProperty('--accent', themeSettings.accentColor);
    document.documentElement.style.setProperty('--primary-glow', themeSettings.halfmoonCore === 'swiss'
      ? 'transparent' : `rgba(${hexToRgb(themeSettings.primaryColor)}, 0.25)`);

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
      const updated = normalizeThemeSettings({ ...prev, ...updates }, prev);
      syncToBackend(updated);
      return updated;
    });
  };

  const exportThemeJSON = (): string => {
    const exportData = {
      schemaVersion: 2,
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
      const parsed = JSON.parse(jsonString) as Partial<ThemeSettings>;
      if (!parsed || typeof parsed !== 'object') return false;
      const supportedKeys: Array<keyof ThemeSettings> = [
        'mode', 'halfmoonCore', 'primaryColor', 'secondaryColor', 'accentColor', 'customCSS'
      ];
      const hasThemeData = supportedKeys.some(key => Object.prototype.hasOwnProperty.call(parsed, key));
      if (!hasThemeData) return false;

      const imported = normalizeThemeSettings(parsed, themeSettings);
      if (!validateCSS(imported.customCSS).isValid) return false;
      updateThemeSettings(imported);
      return true;
    } catch (e) {
      console.error('Invalid theme JSON imported', e);
    }
    return false;
  };

  return (
    <ThemeContext.Provider value={{
      themeSettings,
      updateThemeSettings,
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
