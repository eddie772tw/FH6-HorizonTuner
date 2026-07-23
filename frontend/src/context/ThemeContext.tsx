import React, { createContext, useContext, useState, useEffect } from 'react';

export interface ThemeSlot {
  id: number;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  mode: 'dark' | 'light';
  customCSS: string;
  savedAt?: string;
}

export interface ThemeSettings {
  mode: 'dark' | 'light';
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  customCSS: string;
  slots: ThemeSlot[];
}

export const defaultThemeSettings: ThemeSettings = {
  mode: 'dark',
  primaryColor: '#00f0ff',
  secondaryColor: '#ff003c',
  accentColor: '#7000ff',
  customCSS: '',
  slots: [
    { id: 1, name: 'Slot 1', primaryColor: '#00f0ff', secondaryColor: '#ff003c', accentColor: '#7000ff', mode: 'dark', customCSS: '' },
    { id: 2, name: 'Slot 2', primaryColor: '#00ff88', secondaryColor: '#ffbb00', accentColor: '#0099ff', mode: 'dark', customCSS: '' },
    { id: 3, name: 'Slot 3', primaryColor: '#ff00aa', secondaryColor: '#00ffff', accentColor: '#9900ff', mode: 'dark', customCSS: '' },
  ]
};

export const getDefaultCSSTemplate = (settings: ThemeSettings): string => {
  return `/* FH6 HorizonTuner Active Theme Style Template */
:root {
  --primary: ${settings.primaryColor};
  --secondary: ${settings.secondaryColor};
  --accent: ${settings.accentColor};
  --glass-bg: ${settings.mode === 'dark' ? 'rgba(25, 28, 36, 0.55)' : 'rgba(255, 255, 255, 0.78)'};
  --glass-border: ${settings.mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.12)'};
  --glass-blur: 12px;
  --panel-radius: 16px;
  --input-radius: 6px;
}

/* Glass Panel Customization */
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
          slots: parsed.slots && parsed.slots.length > 0 ? parsed.slots : defaultThemeSettings.slots
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
        const res = await fetch('http://127.0.0.1:8001/api/settings');
        const data = await res.json();
        if (data && data.theme) {
          setThemeSettings(prev => ({
            ...defaultThemeSettings,
            ...prev,
            ...data.theme,
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
    // Apply dataset theme (dark or light)
    document.documentElement.setAttribute('data-theme', themeSettings.mode || 'dark');

    // Inject CSS variables
    document.documentElement.style.setProperty('--primary', themeSettings.primaryColor);
    document.documentElement.style.setProperty('--secondary', themeSettings.secondaryColor);
    document.documentElement.style.setProperty('--accent', themeSettings.accentColor);

    // Inject custom CSS
    let styleTag = document.getElementById('custom-theme-css');
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = 'custom-theme-css';
      document.head.appendChild(styleTag);
    }
    styleTag.innerHTML = themeSettings.customCSS;

    // Save to LocalStorage
    localStorage.setItem('themeSettings', JSON.stringify(themeSettings));
  }, [themeSettings]);

  const syncToBackend = async (newSettings: ThemeSettings) => {
    try {
      await fetch('http://127.0.0.1:8001/api/settings', {
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
        customCSS: targetSlot.customCSS
      });
    }
  };

  const exportThemeJSON = (): string => {
    const exportData = {
      mode: themeSettings.mode,
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
