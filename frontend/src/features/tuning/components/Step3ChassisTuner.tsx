import { useState } from 'react';
import { useSettings } from '../../../context/SettingsContext';
import type { ChassisTuningResult } from '../../../utils/tuningMath';
import { TuningValuesCard } from './TuningValuesCard';

export function Step3ChassisTuner({ selectedRaceGoal, tuningResult, saveCarParams }: {
  selectedRaceGoal: string;
  tuningResult: ChassisTuningResult | null;
  saveCarParams: () => Promise<void>;
}) {
  const { convertSpringRate, convertHeight, t } = useSettings();
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const handleSave = async () => {
    setSaveState('saving');
    try { await saveCarParams(); setSaveState('saved'); }
    catch { setSaveState('failed'); }
  };
  if (!tuningResult) return <p>{t('Please define basic vehicle parameters in Step 1 first.')}</p>;
  const { springs, arb, damping } = tuningResult;
  const spring = (value: number) => { const unit = convertSpringRate(value); return `${unit.value.toFixed(1)} ${unit.label}`; };
  const height = (value: number) => { const unit = convertHeight(value); return `${unit.value.toFixed(1)} ${unit.label}`; };
  return <section className="glass-panel p-4 d-flex flex-column gap-3">
    <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
      <h3 className="h5 text-primary mb-0">{t('Chassis platform')} · {t(selectedRaceGoal)}</h3>
      <button type="button" className="btn btn-outline-primary btn-sm" disabled={saveState === 'saving'} onClick={() => void handleSave()}>
        {t(saveState === 'saving' ? 'Saving...' : 'Save vehicle inputs')}
      </button>
    </div>
    <p className="text-body-secondary mb-0">{t('Establish springs and ride height, then review roll balance and damping. Verify alignment at this platform before comparing laps.')}</p>
    <div className="row g-3">
      <div className="col-12 col-xl-6"><TuningValuesCard title="Springs & Ride Height" rows={[
        ['Front Spring Stiffness', spring(springs.front)], ['Rear Spring Stiffness', spring(springs.rear)],
        ['Front Ride Height', height(springs.heightF)], ['Rear Ride Height', height(springs.heightR)],
      ]} /></div>
      <div className="col-12 col-xl-6"><TuningValuesCard title="Anti-Roll Bars (ARB)" rows={[
        ['Front ARB', arb.front], ['Rear ARB', arb.rear],
      ]} /></div>
      <div className="col-12 col-xl-6"><TuningValuesCard title="Damping System" rows={[
        ['Front Rebound Damping', damping.reboundF], ['Rear Rebound Damping', damping.reboundR],
        ['Front Bump Damping', damping.bumpF], ['Rear Bump Damping', damping.bumpR],
      ]} /></div>
    </div>
    <div role="status" className={`small ${saveState === 'failed' ? 'text-danger' : 'text-body-secondary'}`} style={{ minHeight: '1.5em' }}>
      {saveState === 'failed' ? t('Save failed.') : saveState === 'saved' ? t('Changes saved') : ''}
    </div>
  </section>;
}
