import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { useTelemetry } from '../hooks/useTelemetry';
import { useSettings } from './SettingsContext';
import { apiClient } from '../services/apiClient';

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
  frontTireWidth?: number;
  frontTireAspect?: number;
  frontTireRim?: number;
  rearTireWidth?: number;
  rearTireAspect?: number;
  rearTireRim?: number;
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

  spring_front_min?: number;
  spring_front_max?: number;
  spring_rear_min?: number;
  spring_rear_max?: number;
  arb_front_min?: number;
  arb_front_max?: number;
  arb_rear_min?: number;
  arb_rear_max?: number;

  roll_center_front?: number;
  roll_center_rear?: number;
  anti_dive?: number;
  anti_squat?: number;

  target_ride_frequency?: number;
  target_rebound_ratio?: number;
  target_bump_ratio?: number;
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
  carsWithParams: { id: string; name: string }[];
  telemetryCarId: string;
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
  const [carsWithParams, setCarsWithParams] = useState<{ id: string; name: string }[]>([]);

  const fetchCarsWithParams = async () => {
    try {
      const db = await apiClient.getCarDatabase() as Record<string, any>;
      if (db) {
        setCarDb(db);
        const carsList = Object.entries(db).map(([id, info]: [string, any]) => ({
          id,
          name: info.display_name || id,
        }));
        setCarsWithParams(carsList);
      }
    } catch (e) {
      console.error("Failed to fetch cars with params", e);
    }
  };

  useEffect(() => {
    fetchCarsWithParams();
  }, []);

  const carName = carDb[carId]?.display_name || 'Unknown Car';

  const prevTelemetryCarIdRef = useRef<string>('');

  useEffect(() => {
    if (telemetryCarId && telemetryCarId !== '0') {
      if (telemetryCarId !== prevTelemetryCarIdRef.current) {
        setCarId(telemetryCarId);
      }
    }
    prevTelemetryCarIdRef.current = telemetryCarId;
  }, [telemetryCarId]);

  useEffect(() => {
    let active = true;
    const fetchParams = async () => {
      setIsLoading(true);
      try {
        const result = (await apiClient.getCarParams(carId)) as CarParams | null;
        if (active && result && !('error' in (result as any))) {
          setCarParams(result);
        } else if (active) {
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
            frontTireWidth: 245,
            frontTireAspect: 40,
            frontTireRim: 18,
            rearTireWidth: 245,
            rearTireAspect: 40,
            rearTireRim: 18,
            adjustability: {
              gearbox: 'Full',
              gears: 6,
              suspension: 'Race',
              arb: 'Adjustable',
              aero: 'Adjustable',
              brakes: 'Adjustable',
              diff: 'Adjustable'
            },
            dyno_curve: {},
            spring_front_min: 10.0,
            spring_front_max: 120.0,
            spring_rear_min: 10.0,
            spring_rear_max: 120.0,
            arb_front_min: 1.0,
            arb_front_max: 65.0,
            arb_rear_min: 1.0,
            arb_rear_max: 65.0,
            roll_center_front: 0.0,
            roll_center_rear: 0.0,
            anti_dive: 0,
            anti_squat: 0,
            target_ride_frequency: 2.4,
            target_rebound_ratio: 0.70,
            target_bump_ratio: 0.55
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

  const saveCarParams = async () => {
    if (!carParams) return;
    try {
      await apiClient.saveCarParams(carId, carParams);
      await fetchCarsWithParams();
    } catch (e) {
      console.error("Failed to save car params", e);
    }
  };

  const clearDynoCurve = async () => {
    try {
      await apiClient.deleteDynoCurve(carId);
      setCarParams(prev => prev ? { ...prev, dyno_curve: {} } : prev);
    } catch (e) {
      console.error("Failed to clear dyno curve", e);
    }
  };

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
      settings, updateSettings, isLoading,
      carsWithParams, telemetryCarId
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
