import React, { useState } from 'react';
import { useSettings } from '../../context/SettingsContext';
import { roadExplorationStep } from '../../utils/tuningMath';
import type { RoadSetup } from './roadTypes';

interface Props { runId: string; basis: RoadSetup; busy: boolean; create: (body: unknown) => Promise<RoadSetup | null>; onCreated: (id: string) => void }
const PARAMETER_UNITS: Record<string, string[]> = { pressure: ['psi', 'bar', 'kPa'], spring: ['kgf/mm', 'lb/in', 'N/mm'], height: ['cm', 'in'], diff: ['%'] };
const unitsFor = (parameter: string): string[] => PARAMETER_UNITS[parameter.split('.')[0]] || ['slider'];
export function RoadCandidate({ runId, basis, busy, create, onCreated }: Props) {
  const { t } = useSettings();
  const savedValues = (key: string) => { const field = basis.fields[key]; return { value: field ? String(field.value) : '', minimum: field ? String(field.minimum) : '', maximum: field ? String(field.maximum) : '', step: field ? String(field.step) : '' }; };
  const [parameter, setParameter] = useState('pressure.front');
  const [unit, setUnit] = useState(basis.fields['pressure.front']?.unit || 'psi');
  const [values, setValues] = useState(() => savedValues('pressure.front'));
  const [direction, setDirection] = useState<-1 | 1>(1);
  const [confirmed, setConfirmed] = useState(false);
  const [hypothesis, setHypothesis] = useState('');
  const numeric = { value: Number(values.value), minimum: Number(values.minimum), maximum: Number(values.maximum), step: Number(values.step) };
  const candidate = Object.values(values).every(v => v.trim()) ? roadExplorationStep(numeric, direction) : null;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!confirmed || candidate === null) return;
    const result = await create({ baselineRunId: runId, parameter, baseline: { ...numeric, unit, source: 'game-confirmed' },
      candidateValue: candidate, baselineValueUnchanged: true, hypothesis: hypothesis.trim() || 'Compare full-event time and matched local slip with A', source: 'one-game-step-exploration' });
    if (result) onCreated(result.id);
  };
  return <section className="glass-panel p-4">
    <h3 className="h5">{t('Try one reversible change')}</h3>
    <p>{t('No validated direction is available from this observation alone. Choose one exploratory change, or keep A.')}</p>
    <form onSubmit={submit} className="d-flex flex-column gap-3">
      <div className="row g-3">
        <label className="col-md-6">{t('Parameter')}<select className="form-select" value={parameter} onChange={e => { setParameter(e.target.value); setUnit(basis.fields[e.target.value]?.unit || unitsFor(e.target.value)[0]); setValues(savedValues(e.target.value)); setConfirmed(false); }}>
          {['pressure.front', 'pressure.rear', 'arb.front', 'arb.rear', 'spring.front', 'spring.rear', 'height.front', 'height.rear', 'rebound.front', 'rebound.rear', 'bump.front', 'bump.rear', 'diff.front.acceleration', 'diff.front.deceleration', 'diff.rear.acceleration', 'diff.rear.deceleration', 'diff.center'].map(p => <option key={p} value={p}>{t(p)}</option>)}
        </select></label>
        <label className="col-md-6">{t('Game unit')}<select className="form-select" value={unit} onChange={e => { setUnit(e.target.value); setValues({ value: '', minimum: '', maximum: '', step: '' }); setConfirmed(false); }}>
          {unitsFor(parameter).map(u => <option key={u}>{u}</option>)}
        </select></label>
      </div>
      <div className="row g-3">{(['value', 'minimum', 'maximum', 'step'] as const).map((key, i) => <label className="col-sm-6 col-xl-3" key={key}>{t(['Current game value', 'Game minimum', 'Game maximum', 'One game step'][i])}
        <input className="form-control" type="number" step="any" required value={values[key]} onChange={e => { setValues({ ...values, [key]: e.target.value }); setConfirmed(false); }} /></label>)}</div>
      <label>{t('Exploration direction')}<select className="form-select" value={direction} onChange={e => setDirection(Number(e.target.value) as -1 | 1)}><option value={1}>{t('Increase one game step')}</option><option value={-1}>{t('Decrease one game step')}</option></select></label>
      <details><summary>{t('Optional test note')}</summary><label>{t('What will this test check?')}<input className="form-control" maxLength={400} value={hypothesis} onChange={e => setHypothesis(e.target.value)} placeholder={t('Compare full-event time and matched local slip with A')} /></label></details>
      <label className="d-flex gap-2"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />{t('I read these limits and the current value in game, and this value was unchanged throughout baseline A.')}</label>
      <div className="d-flex align-items-center flex-wrap gap-3">
        <span>{t('Frozen A → candidate B')}: {candidate === null ? t('Enter a valid game range and step') : numeric.value + ' → ' + candidate + ' ' + unit}</span>
        <button className="btn btn-primary" type="submit" disabled={busy || !confirmed || candidate === null}>{t('Save B draft')}</button>
      </div>
      <p className="small text-body-secondary mb-0">{t('This is an exploration, not an optimized setting. A remains unchanged. Apply B in game and confirm before collecting another run.')}</p>
    </form>
  </section>;
}
