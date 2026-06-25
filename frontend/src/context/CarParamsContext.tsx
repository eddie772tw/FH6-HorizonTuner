import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useTelemetry } from '../hooks/useTelemetry';

export interface CarParams {
  weight: number;
  weight_distribution: number; // % front
  drivetrain: 'FWD' | 'RWD' | 'AWD';
  induction: 'NA' | 'Supercharger' | 'Turbo' | 'TwinTurbo';
  maxHpRpm: number;
  maxTorqueRpm: number;
  adjustability: {
    gearbox: 'Fixed' | 'FinalDrive' | 'Full';
    gears: number; // 4 to 10
    suspension: 'Fixed' | 'Street' | 'Sport' | 'Race';
    arb: 'Fixed' | 'Adjustable';
    aero: 'Fixed' | 'Front Only' | 'Rear Only' | 'Adjustable';
    brakes: 'Fixed' | 'Adjustable';
    diff: 'Fixed' | 'Adjustable';
  };
  dyno_curve: Record<string, { hp: number; torque: number }>;
}

interface CarParamsContextType {
  carId: string;
  setCarId: (id: string) => void;
  carName: string;
  carParams: CarParams | null;
  setCarParams: (params: CarParams) => void;
  saveCarParams: () => Promise<void>;
  isLoading: boolean;
}

const CarParamsContext = createContext<CarParamsContextType | undefined>(undefined);

export const CarParamsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { data } = useTelemetry();
  // Listen to telemetry for CarOrdinal. If it changes, we try to load it.
  const telemetryCarId = data?.CarOrdinal ? data.CarOrdinal.toString() : '';

  const [carId, setCarId] = useState<string>('default_car');
  const [carParams, setCarParams] = useState<CarParams | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [carDb, setCarDb] = useState<Record<string, any>>({});

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
          // If not found, set defaults so UI doesn't crash
            setCarParams({
              weight: 1500,
              weight_distribution: 50,
              drivetrain: 'RWD',
              induction: 'NA',
              maxHpRpm: 0,
              maxTorqueRpm: 0,
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

  // Optionally poll dyno curve if telemetry is active for this car
  useEffect(() => {
    if (telemetryCarId === carId && telemetryCarId !== '0') {
      const interval = setInterval(async () => {
        try {
          const res = await fetch(`http://127.0.0.1:8001/api/car_params/${carId}`);
          const result = await res.json();
          if (!result.error) {
            setCarParams(prev => {
              if (!prev) return result;
              
              let mHp = 0, mHpRpm = prev.maxHpRpm;
              let mTorque = 0, mTorqueRpm = prev.maxTorqueRpm;
              Object.entries(result.dyno_curve as Record<string, {hp: number, torque: number}>).forEach(([rpmStr, vals]) => {
                const rpm = parseInt(rpmStr);
                if (vals.hp > mHp) { mHp = vals.hp; mHpRpm = rpm; }
                if (vals.torque > mTorque) { mTorque = vals.torque; mTorqueRpm = rpm; }
              });

              return { 
                ...prev, 
                dyno_curve: result.dyno_curve,
                maxHpRpm: mHpRpm,
                maxTorqueRpm: mTorqueRpm
              };
            });
          }
        } catch (e) { }
      }, 5000); // pull updates every 5s
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

  return (
    <CarParamsContext.Provider value={{ carId, setCarId, carName, carParams, setCarParams, saveCarParams, isLoading }}>
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
