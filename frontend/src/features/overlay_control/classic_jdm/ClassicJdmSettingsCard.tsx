import React from 'react';
import type { HudConfig } from '../hudConfig';
import {
  CLASSIC_JDM_AUX_GAUGES,
  CLASSIC_JDM_DEFI_THEMES,
  CLASSIC_JDM_TACH_STYLES,
  type ClassicJdmAuxGauge,
  type ClassicJdmDefiTheme,
  type ClassicJdmTachStyle,
} from './config';

interface ClassicJdmSettingsCardProps {
  config: HudConfig;
  onChange: (updates: Partial<HudConfig>) => void;
  t: (key: string) => string;
}

export const ClassicJdmSettingsCard: React.FC<ClassicJdmSettingsCardProps> = ({
  config,
  onChange,
  t,
}) => {
  const showTriple = config.classicJdmShowTriple !== false;

  return (
    <div className="border-top pt-2">
      {/* 1. Tachometer Style */}
      <div className="mb-2">
        <label htmlFor="classic-jdm-tach-style" className="form-label fs-7 text-body-secondary mb-1">
          {t("Tachometer Style")}:
        </label>
        <select
          id="classic-jdm-tach-style"
          className="form-select form-select-sm fw-bold"
          value={config.classicJdmTachStyle ?? 'trd'}
          onChange={(e) => onChange({ classicJdmTachStyle: e.target.value as ClassicJdmTachStyle })}
        >
          {CLASSIC_JDM_TACH_STYLES.map((style) => (
            <option key={style.value} value={style.value}>
              {t(style.label)}
            </option>
          ))}
        </select>
      </div>

      {/* 2. Triple Aux Gauges Toggle */}
      <div className="d-flex justify-content-between align-items-center mb-2">
        <label htmlFor="classic-jdm-triple-toggle" className="form-label fs-7 text-body-secondary mb-0">
          {t("Triple Aux Gauges")}:
        </label>
        <button
          id="classic-jdm-triple-toggle"
          type="button"
          className="btn btn-sm btn-outline-secondary"
          aria-label={t("Triple Aux Gauges")}
          aria-pressed={showTriple}
          onClick={() => onChange({ classicJdmShowTriple: !showTriple })}
        >
          {t(showTriple ? "Enabled" : "Disabled")}
        </button>
      </div>

      {/* 3. Aux Gauge 1 & 2 Selectors (When Triple Gauges Enabled) */}
      {showTriple && (
        <>
          <div className="mb-2">
            <label htmlFor="classic-jdm-aux1" className="form-label fs-7 text-body-secondary mb-1">
              {t("Aux Gauge 1")}:
            </label>
            <select
              id="classic-jdm-aux1"
              className="form-select form-select-sm fw-bold"
              value={config.classicJdmAux1 ?? 'tire_temp_4w'}
              onChange={(e) => onChange({ classicJdmAux1: e.target.value as ClassicJdmAuxGauge })}
            >
              {CLASSIC_JDM_AUX_GAUGES.map((g) => (
                <option key={g.value} value={g.value}>
                  {t(g.label)}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-2">
            <label htmlFor="classic-jdm-aux2" className="form-label fs-7 text-body-secondary mb-1">
              {t("Aux Gauge 2")}:
            </label>
            <select
              id="classic-jdm-aux2"
              className="form-select form-select-sm fw-bold"
              value={config.classicJdmAux2 ?? 'tire_temp_rear'}
              onChange={(e) => onChange({ classicJdmAux2: e.target.value as ClassicJdmAuxGauge })}
            >
              {CLASSIC_JDM_AUX_GAUGES.map((g) => (
                <option key={g.value} value={g.value}>
                  {t(g.label)}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {/* 4. Defi Backlight Theme */}
      <div className="mb-2">
        <label htmlFor="classic-jdm-defi-theme" className="form-label fs-7 text-body-secondary mb-1">
          {t("Defi Backlight Theme")}:
        </label>
        <select
          id="classic-jdm-defi-theme"
          className="form-select form-select-sm fw-bold"
          value={config.classicJdmDefiTheme ?? 'amber'}
          onChange={(e) => onChange({ classicJdmDefiTheme: e.target.value as ClassicJdmDefiTheme })}
        >
          {CLASSIC_JDM_DEFI_THEMES.map((theme) => (
            <option key={theme.value} value={theme.value}>
              {t(theme.label)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};
