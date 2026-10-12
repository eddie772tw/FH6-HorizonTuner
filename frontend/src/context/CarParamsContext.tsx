import React, { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback } from 'react';
import { useTelemetry } from '../hooks/useTelemetry';
import { useSettings } from './SettingsContext';
import { backendFetch } from '../services/backend';
import type { DynoQuality } from '../features/car_params/dynoQuality';
import type { EvGearboxSetup } from '../domain/tuning/ev/types';

export interface CarParams {
  transmission?: import('../domain/tuning/transmission').TransmissionSelection;
  isElectric?: boolean;
  evGearbox?: EvGearboxSetup;
  weight: number;
  weight_distribution: number; // % front
  drivetrain: 'FWD' | 'RWD' | 'AWD';
  roadAwdRearPercent?: number;
  induction: 'NA' | 'Supercharger' | 'Turbo' | 'TwinTurbo';
  maxHp: number;
  maxTorque: number;
  maxHpRpm: number;
  maxTorqueRpm: number;
  /** Optional Drag finish speed; used only with explicit provenance. */
  dragFinishSpeedKmh?: number;
  dragFinishSpeedProvenance?: 'telemetry' | 'manual';
  aeroInputVersion?: 'optional/v1';
  aeroBalance?: number | null;
  aeroEfficiency: number;
  mechBalance?: number;
  aero_downforce_front?: number | null;
  aero_downforce_rear?: number | null;
  frontTireWidth?: number;
  frontTireAspect?: number;
  frontTireRim?: number;
  rearTireWidth?: number;
  rearTireAspect?: number;
  rearTireRim?: number;
  tireType?: string;
  rallyProfile?: 'mixed-surface' | 'cross-country';
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
  spring_front_min?: number | null;
  spring_front_max?: number | null;
  spring_rear_min?: number | null;
  spring_rear_max?: number | null;
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
  saveCarParams: (snapshot?: CarParams) => Promise<void>;
  clearDynoCurve: () => Promise<void>;
  importDynoValues: () => void;
  settings: any;
  updateSettings: (updates: any) => Promise<void>;
  isLoading: boolean;
  loadedCarId: string | null;
  carsWithParams: { id: string; name: string }[];
  telemetryCarId: string;
  selectionSource: 'default' | 'saved' | 'live';
  selectionGeneration: number;
  followLiveCar: () => void;
  profileError: boolean;
  savedCarsStatus: 'loading' | 'ready' | 'error';
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
  const { data, isConnected } = useTelemetry();
  const telemetryCarId = Number.isInteger(data?.CarOrdinal) && (data?.CarOrdinal ?? 0) > 0 ? String(data!.CarOrdinal) : '';
  const { settings, updateSettings } = useSettings();

  const [selection, setSelection] = useState({ carId: 'default_car', source: 'default' as CarParamsContextType['selectionSource'], generation: 0 });
  const { carId, source: selectionSource, generation: selectionGeneration } = selection;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const selectCar = useCallback((id: string, source: CarParamsContextType['selectionSource']) => {
    setSelection(previous => previous.carId === id && previous.source === source ? previous
      : { carId: id, source, generation: previous.generation + 1 });
  }, []);
  const setCarId = useCallback((id: string) => selectCar(id, 'saved'), [selectCar]);
  const followLiveCar = useCallback(() => { if (telemetryCarId) selectCar(telemetryCarId, 'live'); }, [telemetryCarId, selectCar]);
  const [storedParams, setStoredParams] = useState<CarParams | null>(null);
  const [loadedGeneration, setLoadedGeneration] = useState<number | null>(null);
  const carParams = loadedGeneration === selectionGeneration ? storedParams : null;
  const setCarParams = (params: CarParams) => {
    if (loadedGeneration === selectionGeneration && selectionRef.current.generation === selectionGeneration) setStoredParams(params);
  };
  const [isLoading, setIsLoading] = useState(false);
  const loadedCarId = loadedGeneration === selectionGeneration ? carId : null;
  const [profileError, setProfileError] = useState(false);
  const [savedCarsStatus, setSavedCarsStatus] = useState<CarParamsContextType['savedCarsStatus']>('loading');
  const [carDb, setCarDb] = useState<Record<string, any>>({});
  const [carsWithParams, setCarsWithParams] = useState<{ id: string; name: string }[]>([]);

  const fetchCarsWithParams = async () => {
    try {
      const res = await backendFetch('/api/cars/with_params');
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        setCarsWithParams(data);
        setSavedCarsStatus('ready');
      } else throw new Error('Saved vehicles unavailable');
    } catch (e) {
      setSavedCarsStatus('error');
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

  const carName = carDb[carId]?.display_name || carsWithParams.find(car => car.id === carId)?.name || 'Unknown Car';

  const prevTelemetryCarIdRef = useRef<string>('');
  const previousConnection = useRef(isConnected);

  // Auto-switch to telemetry car id if it's active and has actually changed
  useEffect(() => {
    if (isConnected && telemetryCarId) {
      if (telemetryCarId !== prevTelemetryCarIdRef.current || !previousConnection.current) {
        selectCar(telemetryCarId, 'live');
      }
    }
    prevTelemetryCarIdRef.current = telemetryCarId;
    previousConnection.current = isConnected;
  }, [telemetryCarId, isConnected, selectCar]);

  // Load params when carId changes
  useEffect(() => {
    let active = true;
    let retry: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const fetchParams = async () => {
      setIsLoading(true);
      setProfileError(false);
      try {
        const res = await backendFetch(`/api/car_params/${carId}`, { signal: controller.signal });
        const result = await res.json();
        if (!res.ok) throw new Error('Car parameters unavailable');
        if (result.error && selectionSource === 'saved') throw new Error('Saved vehicle profile unavailable');
        const normalized = await backendFetch('/api/tuning/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(result.error ? {} : result), signal: controller.signal });
        if (!normalized.ok) throw new Error('Car profile normalization unavailable');
        const profile = await normalized.json() as CarParams;
        if (active && selectionRef.current.generation === selectionGeneration) {
          setStoredParams(profile); setLoadedGeneration(selectionGeneration);
        }
      } catch (e) {
        if (active) { setProfileError(true); console.error("Failed to load car params", e); retry = setTimeout(fetchParams, 2000); }
      } finally {
        if (active) setIsLoading(false);
      }
    };
    if (carId) fetchParams();
    return () => { active = false; controller.abort(); clearTimeout(retry); };
  }, [carId, selectionGeneration]);

  // Poll live dyno fields only, without overwriting user-edited car params.
  useEffect(() => {
    if (selectionSource === 'live' && telemetryCarId === carId && loadedCarId === carId) {
      let active = true;
      const controller = new AbortController();
      const interval = setInterval(async () => {
        try {
          const res = await backendFetch(`/api/car_params/${carId}`, { signal: controller.signal });
          const result = await res.json();
          if (res.ok && !result.error && active && selectionRef.current.generation === selectionGeneration) {
            setStoredParams(prev => {
              if (!prev) return prev;
              return mergeDynoPollResult(prev, result);
            });
          }
        } catch (e) { }
      }, 5000);
      return () => { active = false; controller.abort(); clearInterval(interval); };
    }
  }, [telemetryCarId, carId, loadedCarId, selectionSource, selectionGeneration]);

  const saveCarParams = async (snapshot = carParams) => {
    if (!snapshot || loadedCarId !== carId || selectionRef.current.generation !== selectionGeneration) return;
    try {
      const response = await backendFetch(`/api/car_params/${carId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot)
      });
      if (!response.ok) throw new Error('Car parameters could not be saved.');
      await fetchCarsWithParams();
    } catch (e) {
      console.error("Failed to save car params", e);
      throw e;
    }
  };

  const clearDynoCurve = async () => {
    try {
      const res = await backendFetch(`/api/car_params/${carId}/dyno_curve`, {
        method: 'DELETE'
      });
      const result = await res.json();
      if (!result.error && selectionRef.current.generation === selectionGeneration) {
        setStoredParams(prev => prev ? { ...prev, dyno_curve: {} } : prev);
      }
    } catch (e) {
      console.error("Failed to clear dyno curve", e);
    }
  };

  // Manually import peak RPM values from dyno curve into car params
  const importDynoValues = async () => {
    if (!carParams || Object.keys(carParams.dyno_curve).length === 0) return;
    const requestedProfile = carParams;
    try {
      const response = await backendFetch('/api/tuning/dyno-peaks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(carParams.dyno_curve) });
      if (!response.ok) return;
      const peaks = await response.json();
      if (selectionRef.current.generation === selectionGeneration) {
        setStoredParams(current => current === requestedProfile ? { ...current, ...peaks } : current);
      }
    } catch { /* Retain the draft until authoritative values are available. */ }
  };



  return (
    <CarParamsContext.Provider value={{
      carId, setCarId, carName, carParams, setCarParams,
      saveCarParams, clearDynoCurve, importDynoValues,
      settings, updateSettings, isLoading, loadedCarId,
      carsWithParams, telemetryCarId, selectionSource, selectionGeneration, followLiveCar, profileError, savedCarsStatus
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
