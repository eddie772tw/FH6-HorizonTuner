import React, { createContext, useContext, useState, useEffect } from 'react';

export interface ThemeSettings {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  customCSS: string;
}

const defaultThemeSettings: ThemeSettings = {
  primaryColor: '#00f0ff',
  secondaryColor: '#ff003c',
  accentColor: '#7000ff',
  customCSS: ''
};

interface ThemeContextType {
  themeSettings: ThemeSettings;
  updateThemeSettings: (updates: Partial<ThemeSettings>) => void;
  resetTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeSettings, setThemeSettings] = useState<ThemeSettings>(() => {
    const saved = localStorage.getItem('themeSettings');
    if (saved) {
      try {
        return { ...defaultThemeSettings, ...JSON.parse(saved) };
      } catch (e) {
        console.error('Failed to parse theme settings from local storage', e);
      }
    }
    return defaultThemeSettings;
  });

  useEffect(() => {
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

    localStorage.setItem('themeSettings', JSON.stringify(themeSettings));
  }, [themeSettings]);

  const updateThemeSettings = (updates: Partial<ThemeSettings>) => {
    setThemeSettings(prev => ({ ...prev, ...updates }));
  };

  const resetTheme = () => {
    setThemeSettings(defaultThemeSettings);
  };

  return (
    <ThemeContext.Provider value={{ themeSettings, updateThemeSettings, resetTheme }}>
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
