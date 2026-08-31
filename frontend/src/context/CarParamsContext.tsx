import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { useTelemetry } from '../hooks/useTelemetry';
import { useSettings } from './SettingsContext';
import { backendFetch } from '../services/backend';
import type { DynoQuality } from '../features/car_params/dynoQuality';

export interface CarParams {
  weight: number;
  weight_distribution: number; // % front
  drivetrain: 'FWD' | 'RWD' | 'AWD';
  induction: 'NA' | 'Supercharger' | 'Turbo' | 'TwinTurbo';
  maxHp: number;
  maxTorque: number;
  maxHpRpm: number;
  maxTorqueRpm: number;
  aeroBalance?: number;
  aeroEfficiency: number;
  mechBalance?: number;
  aero_downforce_front?: number;
  aero_downforce_rear?: number;
  frontTireWidth?: number;
  frontTireAspect?: number;
  frontTireRim?: number;
  rearTireWidth?: number;
  rearTireAspect?: number;
  rearTireRim?: number;
  tireType?: string;
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
  dyno_quality?: DynoQuality;
  
  // Suspension & Ride Height limits for tuning wizard
  spring_front_min?: number;
  spring_front_max?: number;
  spring_rear_min?: number;
  spring_rear_max?: number;
  height_front_min?: number;
  height_front_max?: number;
  height_rear_min?: number;
  height_rear_max?: number;
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

export const mergeDynoPollResult = (
  previous: CarParams,
  result: Pick<CarParams, 'dyno_curve' | 'dyno_quality'>,
): CarParams => ({
  ...previous,
  dyno_curve: result.dyno_curve,
  dyno_quality: result.dyno_quality,
});

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
      const res = await backendFetch('/api/cars/with_params');
      const data = await res.json();
      if (Array.isArray(data)) {
        setCarsWithParams(data);
      }
    } catch (e) {
      console.error("Failed to fetch cars with params", e);
    }
  };

  // Fetch car database and cars with params
  useEffect(() => {
    backendFetch('/api/cars/database')
      .then(r => r.json())
      .then(data => setCarDb(data))
      .catch(e => console.error(e));
    fetchCarsWithParams();
  }, []);

  const carName = carDb[carId]?.display_name || 'Unknown Car';

  const prevTelemetryCarIdRef = useRef<string>('');

  // Auto-switch to telemetry car id if it's active and has actually changed
  useEffect(() => {
    if (telemetryCarId && telemetryCarId !== '0') {
      if (telemetryCarId !== prevTelemetryCarIdRef.current) {
        setCarId(telemetryCarId);
      }
    }
    prevTelemetryCarIdRef.current = telemetryCarId;
  }, [telemetryCarId]);

  const normalizeCarParams = (raw: any): CarParams => {
    return {
      weight: raw?.weight ?? 1500,
      weight_distribution: raw?.weight_distribution ?? 50,
      drivetrain: raw?.drivetrain ?? 'RWD',
      induction: raw?.induction ?? 'NA',
      maxHp: raw?.maxHp ?? 0,
      maxTorque: raw?.maxTorque ?? 0,
      maxHpRpm: raw?.maxHpRpm ?? 0,
      maxTorqueRpm: raw?.maxTorqueRpm ?? 0,
      aeroBalance: raw?.aeroBalance ?? 0.50,
      aeroEfficiency: raw?.aeroEfficiency ?? 0.50,
      mechBalance: raw?.mechBalance ?? 0.50,
      aero_downforce_front: raw?.aero_downforce_front ?? 0,
      aero_downforce_rear: raw?.aero_downforce_rear ?? 0,
      frontTireWidth: raw?.frontTireWidth ?? 245,
      frontTireAspect: raw?.frontTireAspect ?? 40,
      frontTireRim: raw?.frontTireRim ?? 18,
      rearTireWidth: raw?.rearTireWidth ?? 245,
      rearTireAspect: raw?.rearTireAspect ?? 40,
      rearTireRim: raw?.rearTireRim ?? 18,
      tireType: raw?.tireType ?? 'Stock',
      adjustability: {
        gearbox: raw?.adjustability?.gearbox ?? 'Full',
        gears: raw?.adjustability?.gears ?? 6,
        suspension: raw?.adjustability?.suspension ?? 'Race',
        arb: raw?.adjustability?.arb ?? 'Adjustable',
        aero: raw?.adjustability?.aero ?? 'Adjustable',
        brakes: raw?.adjustability?.brakes ?? 'Adjustable',
        diff: raw?.adjustability?.diff ?? 'Adjustable'
      },
      dyno_curve: raw?.dyno_curve ?? {},
      dyno_quality: raw?.dyno_quality,
      spring_front_min: raw?.spring_front_min ?? 10.0,
      spring_front_max: raw?.spring_front_max ?? 120.0,
      spring_rear_min: raw?.spring_rear_min ?? 10.0,
      spring_rear_max: raw?.spring_rear_max ?? 120.0,
      height_front_min: raw?.height_front_min ?? 10.0,
      height_front_max: raw?.height_front_max ?? 25.0,
      height_rear_min: raw?.height_rear_min ?? 10.0,
      height_rear_max: raw?.height_rear_max ?? 25.0,
      roll_center_front: raw?.roll_center_front ?? 0.0,
      roll_center_rear: raw?.roll_center_rear ?? 0.0,
      anti_dive: raw?.anti_dive ?? 0,
      anti_squat: raw?.anti_squat ?? 0,
      target_ride_frequency: raw?.target_ride_frequency ?? 2.4,
      target_rebound_ratio: raw?.target_rebound_ratio ?? 0.70,
      target_bump_ratio: raw?.target_bump_ratio ?? 0.55
    };
  };

  // Load params when carId changes
  useEffect(() => {
    let active = true;
    const fetchParams = async () => {
      setIsLoading(true);
      try {
        const res = await backendFetch(`/api/car_params/${carId}`);
        const result = await res.json();
        if (active && !result.error) {
          setCarParams(normalizeCarParams(result));
        } else if (active && result.error) {
          setCarParams(normalizeCarParams({}));
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

  // Poll live dyno fields only, without overwriting user-edited car params.
  useEffect(() => {
    if (telemetryCarId === carId && telemetryCarId !== '0') {
      const interval = setInterval(async () => {
        try {
          const res = await backendFetch(`/api/car_params/${carId}`);
          const result = await res.json();
          if (!result.error) {
            setCarParams(prev => {
              if (!prev) return result;
              return mergeDynoPollResult(prev, result);
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
      await backendFetch(`/api/car_params/${carId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(carParams)
      });
      await fetchCarsWithParams();
    } catch (e) {
      console.error("Failed to save car params", e);
    }
  };

  const clearDynoCurve = async () => {
    try {
      const res = await backendFetch(`/api/car_params/${carId}/dyno_curve`, {
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
