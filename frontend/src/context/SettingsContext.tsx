import React, { createContext, useContext, useState, useEffect } from 'react';

export interface UnitSettings {
  speed: 'kmh' | 'mph';
  weight: 'kg' | 'lbs';
  temperature: 'C' | 'F';
  tirePressure: 'bar' | 'psi' | 'kpa';
  boostPressure: 'psi' | 'bar' | 'kpa';
  springRate: 'kgfmm' | 'lbsin';
  rideHeight: 'cm' | 'in';
  suspensionForce: 'kgf' | 'lbf';
  power: 'kw' | 'hp' | 'ps';
  torque: 'nm' | 'lbft';
}

export interface AppSettings {
  dyno_recording: boolean;
  race_recording: boolean;
  language: string;
  dyno_test_gear: number;
  dyno_filter_slip: boolean;
  dyno_filter_transients: boolean;
  units: UnitSettings;
  telemetry_ip?: string;
  telemetry_port?: number;
}

interface SettingsContextType {
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings> | { units: Partial<UnitSettings> }) => Promise<void>;
  isLoading: boolean;
  t: (text: string) => string;
  availableLanguages: Array<{ code: string; name: string }>;
  // Speed conversions (input in m/s)
  convertSpeed: (ms: number) => { value: number; label: string };
  // Weight conversions (input in lbs)
  convertWeight: (lbs: number) => { value: number; label: string };
  convertWeightToLbs: (val: number) => number;
  // Temp conversions (input in F)
  convertTemp: (f: number) => { value: number; label: string };
  // Tire Pressure (input in bar)
  convertTirePressure: (bar: number) => { value: number; label: string };
  convertTirePressureToBar: (val: number) => number;
  // Boost Pressure (input in psi)
  convertBoost: (psi: number) => { value: number; label: string };
  // Spring rate (input in kgf/mm)
  convertSpringRate: (kgfmm: number) => { value: number; label: string };
  convertSpringRateToKgfmm: (val: number) => number;
  // Spring rate (input in lbs/in, for calculator)
  convertSpringRateLbsIn: (lbsin: number) => { value: number; label: string };
  convertSpringRateLbsInToLbsIn: (val: number) => number;
  // Ride Height (input in cm)
  convertHeight: (cm: number) => { value: number; label: string };
  convertHeightToCm: (val: number) => number;
  // Suspension Force (input in kgf)
  convertForce: (kgf: number) => { value: number; label: string };
  convertForceToKgf: (val: number) => number;
  // Power (input in Watts)
  convertPower: (w: number) => { value: number; label: string };
  // Torque (input in Nm)
  convertTorque: (nm: number) => { value: number; label: string };
}

const defaultUnits: UnitSettings = {
  speed: 'kmh',
  weight: 'kg',
  temperature: 'C',
  tirePressure: 'bar',
  boostPressure: 'psi',
  springRate: 'kgfmm',
  rideHeight: 'cm',
  suspensionForce: 'kgf',
  power: 'kw',
  torque: 'nm'
};

const defaultSettings: AppSettings = {
  dyno_recording: true,
  race_recording: true,
  language: 'en-us',
  dyno_test_gear: 4,
  dyno_filter_slip: true,
  dyno_filter_transients: true,
  units: defaultUnits,
  telemetry_ip: '0.0.0.0',
  telemetry_port: 8000
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [availableLanguages, setAvailableLanguages] = useState<Array<{ code: string; name: string }>>([
    { code: 'en-us', name: 'English (US)' }
  ]);

  // Fetch settings from backend
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        // Fetch languages first
        try {
          const langRes = await fetch('http://127.0.0.1:8001/api/languages');
          const langData = await langRes.json();
          if (Array.isArray(langData)) {
            setAvailableLanguages(langData);
          }
        } catch (e) {
          console.error('Failed to fetch available languages', e);
        }

        const res = await fetch('http://127.0.0.1:8001/api/settings');
        const data = await res.json();
        if (data && !data.error) {
          // Merge defaults to handle cases where units might be missing or partially set
          const merged: AppSettings = {
            dyno_recording: data.dyno_recording ?? defaultSettings.dyno_recording,
            race_recording: data.race_recording ?? defaultSettings.race_recording,
            language: data.language ?? defaultSettings.language,
            dyno_test_gear: data.dyno_test_gear ?? defaultSettings.dyno_test_gear,
            dyno_filter_slip: data.dyno_filter_slip ?? defaultSettings.dyno_filter_slip,
            dyno_filter_transients: data.dyno_filter_transients ?? defaultSettings.dyno_filter_transients,
            units: {
              ...defaultUnits,
              ...(data.units || {})
            }
          };
          setSettings(merged);
        }
      } catch (e) {
        console.error('Failed to fetch settings from backend', e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchSettings();
  }, []);

  // Fetch translation when language changes
  useEffect(() => {
    const fetchTranslation = async () => {
      if (settings.language === 'en-us') {
        setTranslations({});
        return;
      }
      try {
        const res = await fetch(`http://127.0.0.1:8001/api/languages/${settings.language}`);
        const data = await res.json();
        if (data && !data.error) {
          setTranslations(data);
        }
      } catch (e) {
        console.error(`Failed to fetch translation for ${settings.language}`, e);
      }
    };
    fetchTranslation();
  }, [settings.language]);

  const updateSettings = async (updates: any) => {
    let newSettings = { ...settings };
    
    if ('units' in updates) {
      newSettings.units = { ...settings.units, ...updates.units };
    } else {
      newSettings = { ...settings, ...updates };
    }
    
    setSettings(newSettings);

    try {
      await fetch('http://127.0.0.1:8001/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
    } catch (e) {
      console.error('Failed to update settings in backend', e);
    }
  };

  // Speed (m/s input)
  const convertSpeed = (ms: number) => {
    if (settings.units.speed === 'mph') {
      return { value: ms * 2.23694, label: 'mph' };
    }
    return { value: ms * 3.6, label: 'km/h' };
  };

  // Weight (lbs input)
  const convertWeight = (lbs: number) => {
    if (settings.units.weight === 'kg') {
      return { value: lbs / 2.20462, label: 'kg' };
    }
    return { value: lbs, label: 'lbs' };
  };

  const convertWeightToLbs = (val: number) => {
    if (settings.units.weight === 'kg') {
      return val * 2.20462;
    }
    return val;
  };

  // Temp (F input)
  const convertTemp = (f: number) => {
    if (settings.units.temperature === 'C') {
      return { value: (f - 32) * 5 / 9, label: '°C' };
    }
    return { value: f, label: '°F' };
  };

  // Tire Pressure (bar input)
  const convertTirePressure = (bar: number) => {
    if (settings.units.tirePressure === 'psi') {
      return { value: bar * 14.5038, label: 'psi' };
    } else if (settings.units.tirePressure === 'kpa') {
      return { value: bar * 100, label: 'kPa' };
    }
    return { value: bar, label: 'bar' };
  };

  const convertTirePressureToBar = (val: number) => {
    if (settings.units.tirePressure === 'psi') {
      return val / 14.5038;
    } else if (settings.units.tirePressure === 'kpa') {
      return val / 100;
    }
    return val;
  };

  // Boost (psi input)
  const convertBoost = (psi: number) => {
    if (settings.units.boostPressure === 'bar') {
      return { value: psi / 14.5038, label: 'bar' };
    } else if (settings.units.boostPressure === 'kpa') {
      return { value: psi * 6.89476, label: 'kPa' };
    }
    return { value: psi, label: 'PSI' };
  };

  // Spring Rate (kgf/mm input, for TuningView.tsx)
  const convertSpringRate = (kgfmm: number) => {
    if (settings.units.springRate === 'lbsin') {
      return { value: kgfmm * 55.9974, label: 'lbs/in' };
    }
    return { value: kgfmm, label: 'kgf/mm' };
  };

  const convertSpringRateToKgfmm = (val: number) => {
    if (settings.units.springRate === 'lbsin') {
      return val / 55.9974;
    }
    return val;
  };

  // Spring Rate (lbs/in input, for TuningCalculator.tsx)
  const convertSpringRateLbsIn = (lbsin: number) => {
    if (settings.units.springRate === 'kgfmm') {
      return { value: lbsin / 55.9974, label: 'kgf/mm' };
    }
    return { value: lbsin, label: 'lbs/in' };
  };

  const convertSpringRateLbsInToLbsIn = (val: number) => {
    if (settings.units.springRate === 'kgfmm') {
      return val * 55.9974;
    }
    return val;
  };

  // Ride Height (cm input)
  const convertHeight = (cm: number) => {
    if (settings.units.rideHeight === 'in') {
      return { value: cm * 0.3937, label: 'in' };
    }
    return { value: cm, label: 'cm' };
  };

  const convertHeightToCm = (val: number) => {
    if (settings.units.rideHeight === 'in') {
      return val / 0.3937;
    }
    return val;
  };

  // Force (kgf input)
  const convertForce = (kgf: number) => {
    if (settings.units.suspensionForce === 'lbf') {
      return { value: kgf * 2.20462, label: 'lbf' };
    }
    return { value: kgf, label: 'kgf' };
  };

  const convertForceToKgf = (val: number) => {
    if (settings.units.suspensionForce === 'lbf') {
      return val / 2.20462;
    }
    return val;
  };

  // Power (W input)
  const convertPower = (w: number) => {
    const kw = w / 1000;
    if (settings.units.power === 'hp') {
      return { value: w / 745.7, label: 'hp' };
    } else if (settings.units.power === 'ps') {
      return { value: kw * 1.35962, label: 'PS' };
    }
    return { value: kw, label: 'kW' };
  };

  // Torque (Nm input)
  const convertTorque = (nm: number) => {
    if (settings.units.torque === 'lbft') {
      return { value: nm * 0.73756, label: 'lb-ft' };
    }
    return { value: nm, label: 'N·m' };
  };

  const t = (text: string): string => {
    if (settings.language === 'en-us') {
      return text;
    }
    return translations[text] ?? text;
  };

  return (
    <SettingsContext.Provider value={{
      settings,
      updateSettings,
      isLoading,
      t,
      availableLanguages,
      convertSpeed,
      convertWeight,
      convertWeightToLbs,
      convertTemp,
      convertTirePressure,
      convertTirePressureToBar,
      convertBoost,
      convertSpringRate,
      convertSpringRateToKgfmm,
      convertSpringRateLbsIn,
      convertSpringRateLbsInToLbsIn,
      convertHeight,
      convertHeightToCm,
      convertForce,
      convertForceToKgf,
      convertPower,
      convertTorque
    }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
