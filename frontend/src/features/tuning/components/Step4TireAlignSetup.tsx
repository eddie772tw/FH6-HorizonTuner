import React from 'react';
import { useSettings } from '../../../context/SettingsContext';
import { CarParams } from '../../../context/CarParamsContext';
import { calculateStaticTireAlignment, Season } from '../../../utils/tuningMath';

interface Step4TireAlignSetupProps {
  selectedRaceGoal: string;
  season: Season;
  carParams: CarParams | null;
  onNextStep?: () => void;
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.5)',
  border: '1px solid rgba(255,255,255,0.15)',
  color: 'white',
  padding: '0.3rem 0.5rem',
  borderRadius: '4px',
  width: '110px',
  textAlign: 'right',
  fontSize: '0.9rem',
  fontWeight: 'bold'
};

const btnStyle: React.CSSProperties = {
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontWeight: 'bold',
  padding: '0.5rem 1.2rem',
  fontSize: '0.85rem',
  transition: 'all 0.2s ease'
};

export const Step4TireAlignSetup: React.FC<Step4TireAlignSetupProps> = ({
  selectedRaceGoal,
  season,
  carParams,
  onNextStep
}) => {
  const { convertTirePressureFromPsi, t } = useSettings();

  if (!carParams) {
    return (
      <div className="glass-panel" style={{ padding: '1.5rem', textAlign: 'center', color: 'gray' }}>
        {t("Please define basic vehicle parameters in Step 1 first.")}
      </div>
    );
  }

  const result = calculateStaticTireAlignment(selectedRaceGoal, season, carParams);

  // Convert PSI to user preferred unit
  const pcFFormatted = convertTirePressureFromPsi(result.pcF);
  const pcRFormatted = convertTirePressureFromPsi(result.pcR);
  const targetHotFormatted = convertTirePressureFromPsi(result.targetPhot);

  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', padding: '1.5rem' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0, color: 'var(--primary)', fontSize: '1.1rem' }}>
            Step 4: {t("Tire Pressure & Alignment Setup (Static)")}
          </h3>
          <p style={{ margin: '0.2rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
            {t("Calculated static baseline for")} <strong>{selectedRaceGoal}</strong> ({t("Season")}: <strong>{season}</strong>)
          </p>
        </div>

        {onNextStep && (
          <button
            type="button"
            onClick={onNextStep}
            style={{ ...btnStyle, background: 'var(--primary)', color: 'black' }}
          >
            {t("Proceed to Step 5 Telemetry Calibration")} &gt;
          </button>
        )}
      </div>

      {/* Grid: 2 Main Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem' }}>
        
        {/* Card 1: Cold & Hot Tire Pressure Recommendations */}
        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1.2rem', borderRadius: '8px', border: '1px solid rgba(0, 180, 255, 0.2)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.4rem' }}>
            <span style={{ color: 'var(--primary)', fontWeight: 600, fontSize: '0.95rem' }}>
              {t("Cold Tire Pressure Setup")}
            </span>
            <span style={{ color: '#00b4d8', fontSize: '0.75rem', fontWeight: 'bold' }}>
              {t("Apply in Tuning Menu")}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
            {/* Front Cold */}
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.8rem', borderRadius: '6px', textAlign: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>{t("Front Cold Pressure")}</span>
              <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#00b4d8', display: 'block', margin: '0.2rem 0' }}>
                {result.pcF} PSI
              </span>
              <span style={{ fontSize: '0.75rem', color: 'gray' }}>
                ({pcFFormatted.value.toFixed(2)} {pcFFormatted.label})
              </span>
            </div>

            {/* Rear Cold */}
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.8rem', borderRadius: '6px', textAlign: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>{t("Rear Cold Pressure")}</span>
              <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#00b4d8', display: 'block', margin: '0.2rem 0' }}>
                {result.pcR} PSI
              </span>
              <span style={{ fontSize: '0.75rem', color: 'gray' }}>
                ({pcRFormatted.value.toFixed(2)} {pcRFormatted.label})
              </span>
            </div>
          </div>

          {/* Hot Target & Season Bias */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.8rem' }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>{t("Target Hot Pressure")}</span>
              <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#00e676' }}>
                {result.targetPhot} PSI ({targetHotFormatted.value.toFixed(1)} {targetHotFormatted.label})
              </span>
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>{t("Season Pressure Bias")}</span>
              <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#ffb703' }}>
                {result.seasonBias >= 0 ? '+' : ''}{result.seasonBias} PSI
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Alignment Geometry Setup */}
        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1.2rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.4rem' }}>
            <span style={{ color: 'var(--primary)', fontWeight: 600, fontSize: '0.95rem' }}>
              {t("Alignment Geometry Setup")}
            </span>
            <span style={{ color: 'gray', fontSize: '0.75rem' }}>
              {t("Offset Dynamic Deformation")}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t("Camber (Front / Rear)")}</span>
              <input 
                type="text" 
                readOnly 
                value={`${result.camber.front}° / ${result.camber.rear}°`} 
                style={{ ...inputStyle, border: '1px solid var(--primary)', width: '130px' }} 
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t("Toe (Front / Rear)")}</span>
              <input 
                type="text" 
                readOnly 
                value={`${result.toe.front} / ${result.toe.rear}`} 
                style={{ ...inputStyle, border: '1px solid var(--primary)', width: '130px' }} 
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t("Caster Angle")}</span>
              <input 
                type="text" 
                readOnly 
                value={`${result.caster}°`} 
                style={{ ...inputStyle, border: '1px solid var(--primary)', width: '130px' }} 
              />
            </div>
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.6rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'gray' }}>
            <span>{t("Front Sidewall Height")}: <strong style={{ color: 'white' }}>{result.hwF} mm</strong></span>
            <span>{t("Rear Sidewall Height")}: <strong style={{ color: 'white' }}>{result.hwR} mm</strong></span>
          </div>
        </div>

      </div>

      {/* Action Directive Footer */}
      <div style={{ background: 'rgba(255, 42, 95, 0.05)', border: '1px solid rgba(255, 42, 95, 0.2)', padding: '1.2rem', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ color: 'white', fontWeight: 600, fontSize: '0.9rem', display: 'block' }}>
            {t("Next Step Guidance")}
          </span>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
            {t("Apply the above cold pressures and alignment angles in-game. Test drive for 2 laps, observe telemetry tire temperatures and hot pressures, then proceed to Step 5.")}
          </span>
        </div>
      </div>

    </div>
  );
};
