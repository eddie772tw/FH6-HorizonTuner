import { useState } from 'react';
import { useSettings } from '../../context/SettingsContext';
import { calculateDomainBaselineGroup, fitRoadGameGrid, type TuningCarParams } from '../../utils/tuningMath';
import { offroadInputGroups } from './offroadBaselineInputs';
import { OFFROAD_DEFAULT_RANGES } from './OffroadGameRanges';
import type { OffroadSetup } from './offroadTypes';

interface Props {
  setup: OffroadSetup;
  busy: boolean;
  saveInitial: (body: unknown) => Promise<unknown>;
}

export function OffroadBaselineBuilder({ setup, busy, saveInitial }: Props) {
  const { t } = useSettings();
  const [section, setSection] = useState<'pressure' | 'springs' | 'height' | 'arb' | 'damping' | 'differential'>('height');
  const [params, setParams] = useState<Partial<TuningCarParams>>({
    weight: 1400, weight_distribution: 52, drivetrain: 'AWD', frontTireWidth: 235, frontTireAspect: 50,
    rearTireWidth: 255, rearTireAspect: 45, spring_front_min: 40, spring_front_max: 160, spring_rear_min: 40, spring_rear_max: 160,
    height_front_min: 12, height_front_max: 26, height_rear_min: 12, height_rear_max: 26,
  });

  const calculated = calculateDomainBaselineGroup('Rally', section, params);
  const handleSave = () => {
    if (!calculated) return;
    const fields: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(calculated)) {
      const spec = OFFROAD_DEFAULT_RANGES[key] || { minimum: 0, maximum: 100, step: 1, unit: item.unit };
      fields[key] = { value: fitRoadGameGrid(item.value, spec.minimum, spec.maximum, spec.step) ?? item.value, unit: item.unit, minimum: spec.minimum, maximum: spec.maximum, step: spec.step, source: 'game-confirmed' };
    }
    const inputsPayload: Record<string, { value: number; unit: string; source: string }> = {};
    for (const name of offroadInputGroups[section] || []) {
      const val = (params as Record<string, number | undefined>)[name];
      if (val !== undefined) inputsPayload[name] = { value: val, unit: 'numeric', source: 'game-confirmed' };
    }
    void saveInitial({ parentSetupId: setup.id, section, inputs: inputsPayload, fields, gameRangesConfirmed: true, formulaVersion: 'offroad-initial/neutral-v1' });
  };

  return (
    <section className="glass-panel p-4">
      <h2 className="h5 mb-3">{t('Offroad Baseline Section Builder')}</h2>
      <div className="btn-group mb-3 flex-wrap" role="group">
        {(['height', 'springs', 'damping', 'arb', 'pressure', 'differential'] as const).map(sec => (
          <button key={sec} type="button" className={`btn btn-sm ${section === sec ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setSection(sec)}>
            {t(sec.toUpperCase())}
          </button>
        ))}
      </div>
      <div className="row g-2 mb-3">
        {(offroadInputGroups[section] || []).map(name => (
          <div key={name} className="col-md-4">
            <label className="form-label small text-body-secondary">{t(name)}</label>
            <input type="number" className="form-control form-control-sm" value={(params as Record<string, number | undefined>)[name] ?? ''} onChange={e => setParams(prev => ({ ...prev, [name]: parseFloat(e.target.value) || 0 }))} />
          </div>
        ))}
      </div>
      <button className="btn btn-outline-primary" disabled={busy || !calculated} onClick={handleSave}>
        {t('Apply Baseline Section Values')}
      </button>
    </section>
  );
}
