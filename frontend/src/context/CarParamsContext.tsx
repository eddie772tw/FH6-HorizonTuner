import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useTelemetry } from '../hooks/useTelemetry';
import { useSettings } from './SettingsContext';

export interface CarParams {
  weight: number;
  weight_distribution: number; // % front
  drivetrain: 'FWD' | 'RWD' | 'AWD';
  induction: 'NA' | 'Supercharger' | 'Turbo' | 'TwinTurbo';
  maxHp: number;
  maxTorque: number;
  maxHpRpm: number;
  maxTorqueRpm: number;
  aeroBalance: number;
  aeroEfficiency: number;
  mechBalance: number;
  adjustability: {
    gearbox: 'Fixed' | 'FinalDrive' | 'Full';
    gears: number; // 4 to 10
    suspension: 'Fixed' | 'Street' | 'Sport' | 'Race';
    arb: 'Fixed' | 'Adjustable';
    aero: 'Fixed' | 'Front Only' | 'Rear Only' | 'Adjustable';
    brakes: 'Fixed' | 'Adjustable';
    diff: 'Fixed' | 'Adjustable';
  };
  dyno_curve: Record<string, { hp: number; torque: number; hp_hist?: number[]; torque_hist?: number[] }>;
}

export interface AppSettings {
  dyno_recording: boolean;
  race_recording: boolean;
}

interface CarParamsContextType {
  carId: string;
  setCarId: (id: string) => void;
  carName: string;
  carParams: CarParams | null;
  setCarParams: (params: CarParams) => void;
  saveCarParams: () => Promise<void>;
  clearDynoCurve: () => Promise<void>;
  importDynoValues: () => void;
  settings: any;
  updateSettings: (updates: any) => Promise<void>;
  isLoading: boolean;
}

const CarParamsContext = createContext<CarParamsContextType | undefined>(undefined);

export const CarParamsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { data } = useTelemetry();
  const telemetryCarId = data?.CarOrdinal ? data.CarOrdinal.toString() : '';
  const { settings, updateSettings } = useSettings();

  const [carId, setCarId] = useState<string>('default_car');
  const [carParams, setCarParams] = useState<CarParams | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [carDb, setCarDb] = useState<Record<string, any>>({});

  // Fetch car database
  useEffect(() => {
    fetch('http://127.0.0.1:8001/api/cars/database')
      .then(r => r.json())
      .then(data => setCarDb(data))
      .catch(e => console.error(e));
  }, []);

  const carName = carDb[carId]?.display_name || 'Unknown Car';

  // Auto-switch to telemetry car id if it's active
  useEffect(() => {
    if (telemetryCarId && telemetryCarId !== '0' && telemetryCarId !== carId) {
      setCarId(telemetryCarId);
    }
  }, [telemetryCarId, carId]);

  // Load params when carId changes
  useEffect(() => {
    let active = true;
    const fetchParams = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`http://127.0.0.1:8001/api/car_params/${carId}`);
        const result = await res.json();
        if (active && !result.error) {
          setCarParams(result);
        } else if (active && result.error) {
            setCarParams({
              weight: 1500,
              weight_distribution: 50,
              drivetrain: 'RWD',
              induction: 'NA',
              maxHp: 0,
              maxTorque: 0,
              maxHpRpm: 0,
              maxTorqueRpm: 0,
              aeroBalance: 0.50,
              aeroEfficiency: 0.50,
              mechBalance: 0.50,
              adjustability: {
                gearbox: 'Full',
                gears: 6,
                suspension: 'Race',
                arb: 'Adjustable',
                aero: 'Adjustable',
                brakes: 'Adjustable',
                diff: 'Adjustable'
              },
              dyno_curve: {}
            });
        }
      } catch (e) {
        console.error("Failed to load car params", e);
      } finally {
        if (active) setIsLoading(false);
      }
    };
    if (carId) fetchParams();
    return () => { active = false; };
  }, [carId]);

  // Poll dyno curve ONLY (no longer overwrites maxHpRpm/maxTorqueRpm)
  useEffect(() => {
    if (telemetryCarId === carId && telemetryCarId !== '0') {
      const interval = setInterval(async () => {
        try {
          const res = await fetch(`http://127.0.0.1:8001/api/car_params/${carId}`);
          const result = await res.json();
          if (!result.error) {
            setCarParams(prev => {
              if (!prev) return result;
              // Only update dyno_curve — preserve all user-edited car params
              return { ...prev, dyno_curve: result.dyno_curve };
            });
          }
        } catch (e) { }
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [telemetryCarId, carId]);

  const saveCarParams = async () => {
    if (!carParams) return;
    try {
      await fetch(`http://127.0.0.1:8001/api/car_params/${carId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(carParams)
      });
    } catch (e) {
      console.error("Failed to save car params", e);
    }
  };

  const clearDynoCurve = async () => {
    try {
      const res = await fetch(`http://127.0.0.1:8001/api/car_params/${carId}/dyno_curve`, {
        method: 'DELETE'
      });
      const result = await res.json();
      if (!result.error) {
        setCarParams(prev => prev ? { ...prev, dyno_curve: {} } : prev);
      }
    } catch (e) {
      console.error("Failed to clear dyno curve", e);
    }
  };

  // Manually import peak RPM values from dyno curve into car params
  const importDynoValues = () => {
    if (!carParams || Object.keys(carParams.dyno_curve).length === 0) return;
    let mHp = 0, mHpRpm = 0;
    let mTorque = 0, mTorqueRpm = 0;
    Object.entries(carParams.dyno_curve).forEach(([rpmStr, vals]) => {
      const rpm = parseInt(rpmStr);
      if (vals.hp > mHp) { mHp = vals.hp; mHpRpm = rpm; }
      if (vals.torque > mTorque) { mTorque = vals.torque; mTorqueRpm = rpm; }
    });
    setCarParams({ ...carParams, maxHp: Math.round(mHp), maxTorque: Math.round(mTorque), maxHpRpm: mHpRpm, maxTorqueRpm: mTorqueRpm });
  };



  return (
    <CarParamsContext.Provider value={{
      carId, setCarId, carName, carParams, setCarParams,
      saveCarParams, clearDynoCurve, importDynoValues,
      settings, updateSettings, isLoading
    }}>
      {children}
    </CarParamsContext.Provider>
  );
};

export const useCarParams = () => {
  const context = useContext(CarParamsContext);
  if (context === undefined) {
    throw new Error('useCarParams must be used within a CarParamsProvider');
  }
  return context;
};
