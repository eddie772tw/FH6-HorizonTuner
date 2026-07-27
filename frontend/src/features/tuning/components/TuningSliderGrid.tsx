import React, { memo } from 'react';
import { useSettings } from '../../../context/SettingsContext';
import { TuningSlider } from './TuningSlider';
import { CarParams } from '../../../context/CarParamsContext';

interface TuningSliderGridProps {
  tuning: any;
  carParams: CarParams | null;
  updateSection: (section: any, field: string, value: any) => void;
}

const TuningSliderGridComponent: React.FC<TuningSliderGridProps> = ({ tuning, carParams, updateSection }) => {
  const { settings, 
    convertTirePressure, 
    convertTirePressureToBar, 
    convertSpringRate, 
    convertSpringRateToKgfmm, 
    convertHeight, 
    convertHeightToCm, 
    t 
  } = useSettings();

  const getUnitLabel = (type: string) => {
    switch(type) {
      case 'pressure': return settings.units.tirePressure === 'bar' ? 'Bar' : 'PSI';
      case 'force': return '';
      case 'spring': return convertSpringRate(1).label;
      case 'height': return convertHeight(1).label;
      default: return '';
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
      {/* Left sliders */}
      <div>
        <h4 style={{ margin: '0 0 0.8rem 0', color: 'var(--primary)', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.3rem', fontSize: '0.95rem' }}>
          🚘 {t("Tire Pressure & ARB Sliders")}
        </h4>
        <TuningSlider label={t("Front Tire Pressure")} value={tuning.tires.front} min={1.0} max={4.0} step={0.01} unitType="pressure" section="tires" field="front" updateSection={updateSection} convertToUI={convertTirePressure} convertFromUI={convertTirePressureToBar} getUnitLabel={getUnitLabel} />
        <TuningSlider label={t("Rear Tire Pressure")} value={tuning.tires.rear} min={1.0} max={4.0} step={0.01} unitType="pressure" section="tires" field="rear" updateSection={updateSection} convertToUI={convertTirePressure} convertFromUI={convertTirePressureToBar} getUnitLabel={getUnitLabel} />
        <TuningSlider label={t("Front Anti-roll Bar")} value={tuning.arb.front} min={carParams?.arb_front_min ?? 1.0} max={carParams?.arb_front_max ?? 65.0} step={0.1} unitType="force" section="arb" field="front" updateSection={updateSection} convertToUI={(v: any) => v} convertFromUI={(v: any) => v} getUnitLabel={getUnitLabel} />
        <TuningSlider label={t("Rear Anti-roll Bar")} value={tuning.arb.rear} min={carParams?.arb_rear_min ?? 1.0} max={carParams?.arb_rear_max ?? 65.0} step={0.1} unitType="force" section="arb" field="rear" updateSection={updateSection} convertToUI={(v: any) => v} convertFromUI={(v: any) => v} getUnitLabel={getUnitLabel} />
      </div>

      {/* Right sliders */}
      <div>
        <h4 style={{ margin: '0 0 0.8rem 0', color: 'var(--primary)', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.3rem', fontSize: '0.95rem' }}>
          {t("Suspension & Damping Sliders")}
        </h4>
        <TuningSlider label={t("Front Springs")} value={tuning.springs.front} min={carParams?.spring_front_min ?? 10.0} max={carParams?.spring_front_max ?? 120.0} step={0.1} unitType="spring" section="springs" field="front" updateSection={updateSection} convertToUI={convertSpringRate} convertFromUI={convertSpringRateToKgfmm} getUnitLabel={getUnitLabel} />
        <TuningSlider label={t("Rear Springs")} value={tuning.springs.rear} min={carParams?.spring_rear_min ?? 10.0} max={carParams?.spring_rear_max ?? 120.0} step={0.1} unitType="spring" section="springs" field="rear" updateSection={updateSection} convertToUI={convertSpringRate} convertFromUI={convertSpringRateToKgfmm} getUnitLabel={getUnitLabel} />
        <TuningSlider label={t("Front Ride Height")} value={tuning.springs.heightF} min={5.0} max={35.0} step={0.1} unitType="height" section="springs" field="heightF" updateSection={updateSection} convertToUI={convertHeight} convertFromUI={convertHeightToCm} getUnitLabel={getUnitLabel} />
        <TuningSlider label={t("Rear Ride Height")} value={tuning.springs.heightR} min={5.0} max={35.0} step={0.1} unitType="height" section="springs" field="heightR" updateSection={updateSection} convertToUI={convertHeight} convertFromUI={convertHeightToCm} getUnitLabel={getUnitLabel} />
        <TuningSlider label={t("Front Rebound Damping")} value={tuning.damping.reboundF} min={1.0} max={20.0} step={0.1} unitType="force" section="damping" field="reboundF" updateSection={updateSection} convertToUI={(v: any) => v} convertFromUI={(v: any) => v} getUnitLabel={getUnitLabel} />
        <TuningSlider label={t("Rear Rebound Damping")} value={tuning.damping.reboundR} min={1.0} max={20.0} step={0.1} unitType="force" section="damping" field="reboundR" updateSection={updateSection} convertToUI={(v: any) => v} convertFromUI={(v: any) => v} getUnitLabel={getUnitLabel} />
        <TuningSlider label={t("Front Bump Damping")} value={tuning.damping.bumpF} min={1.0} max={20.0} step={0.1} unitType="force" section="damping" field="bumpF" updateSection={updateSection} convertToUI={(v: any) => v} convertFromUI={(v: any) => v} getUnitLabel={getUnitLabel} />
        <TuningSlider label={t("Rear Bump Damping")} value={tuning.damping.bumpR} min={1.0} max={20.0} step={0.1} unitType="force" section="damping" field="bumpR" updateSection={updateSection} convertToUI={(v: any) => v} convertFromUI={(v: any) => v} getUnitLabel={getUnitLabel} />
      </div>
    </div>
  );
};

export const TuningSliderGrid = memo(TuningSliderGridComponent);
