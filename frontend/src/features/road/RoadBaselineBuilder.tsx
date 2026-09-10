import { useEffect, useMemo, useState } from 'react';
import { useCarParams } from '../../context/CarParamsContext';
import { useSettings } from '../../context/SettingsContext';
import { calculateRoadBaselineGroup, type TuningCarParams } from '../../utils/tuningMath';
import { useEngineMeasurementArchive } from '../tuning/useEngineMeasurementArchive';
import { EngineObservationHistory } from '../tuning/components/EngineObservationHistory';
import { TuningMeasurementStep } from '../tuning/components/TuningMeasurementStep';
import { RoadGameRanges, fittedRoadFields, type RoadRangeInputs } from './RoadGameRanges';
import { roadInputGroups, roadInputUnits, type RoadBaselineGroup, type InputName } from './roadBaselineInputs';
import { documentsOf, type RoadDocument, type RoadSetup, type RoadWorkflow } from './roadTypes';

interface Props { workflow: RoadWorkflow; documents: RoadDocument[]; busy: boolean; save: (body: unknown) => Promise<RoadSetup | null>; onReady: (id: string) => void }
export function RoadBaselineBuilder({ workflow, documents, busy, save, onReady }: Props) {
  const { t } = useSettings();
  const { carParams, loadedCarId } = useCarParams();
  const [group, setGroup] = useState<RoadBaselineGroup>('pressure');
  const [inputs, setInputs] = useState<Partial<Record<InputName, string>>>({});
  const [ranges, setRanges] = useState<RoadRangeInputs>({});
  const [confirmed, setConfirmed] = useState(false);
  const setups = documentsOf(documents, 'setup').filter(s => !s.baselineSetupId);
  const parent = setups[setups.length - 1];
  const carId = String(workflow.identity.ordinal);
  const drivetrain = (['FWD', 'RWD', 'AWD'] as const)[workflow.identity.drivetrain];
  const savedInputs = documentsOf(documents, 'vehicle-inputs');
  const required = roadInputGroups[group];
  const inherited = useMemo(() => {
    const values: Partial<Record<InputName, string>> = {};
    if (loadedCarId === carId && carParams) for (const key of Object.keys(roadInputUnits) as InputName[]) {
      const value = key === 'numGears' ? carParams.adjustability.gears : carParams[key];
      if (typeof value === 'number') values[key] = String(value);
    }
    for (const snapshot of savedInputs) for (const [key, field] of Object.entries(snapshot.fields)) values[key as InputName] = String(field.value);
    return values;
  }, [documents, carParams, loadedCarId, carId]);
  const effective = { ...inherited, ...inputs };
  const params: Partial<TuningCarParams> & { numGears?: number } = { drivetrain };
  for (const key of required) if (effective[key]?.trim()) (params as Record<string, unknown>)[key] = Number(effective[key]);
  const engineProfile = { weight: 0, weight_distribution: 0, maxHp: params.maxHp || 0, maxTorque: 0, maxHpRpm: 0, maxTorqueRpm: 0, drivetrain };
  const engine = useEngineMeasurementArchive(carId, engineProfile);
  const observed = engine.current;
  const estimates = calculateRoadBaselineGroup(group, params, observed ? { maxRpm: observed.engineMaxRpm!, maxHpRpm: observed.observedPeakPower!.rpm, maxTorqueRpm: observed.observedPeakTorque!.rpm } : null);
  const allRanges = { ...Object.fromEntries(Object.entries(parent?.fields || {}).filter(([key, field]) => estimates?.[key]?.unit === field.unit).map(([key, field]) => [key, { minimum: String(field.minimum), maximum: String(field.maximum), step: String(field.step) }])), ...ranges };
  for (const family of ['spring', 'height']) for (const axle of ['front', 'rear']) {
    const parameter = family + '.' + axle;
    const minimum = effective[(family + '_' + axle + '_min') as InputName];
    const maximum = effective[(family + '_' + axle + '_max') as InputName];
    if (minimum && maximum && !ranges[parameter]) allRanges[parameter] = { ...allRanges[parameter], minimum, maximum, step: allRanges[parameter]?.step || '' };
  }
  const fitted = estimates ? fittedRoadFields(estimates, allRanges) : null;
  const ready = confirmed && fitted && Object.values(fitted).every(Boolean) && parent;
  useEffect(() => { setConfirmed(false); }, [group, inputs, ranges, observed, inherited]);
  const saveDraft = async () => {
    if (!ready || !fitted || !parent) return;
    const source = engine.observation;
    const result = await save({ parentSetupId: parent.id, section: group, fields: fitted, gameRangesConfirmed: true,
      engineObservation: group === 'gearing' && source && observed ? { observationId: source.id, carId: source.carId, performanceIndex: observed.identity!.performanceIndex,
        capturedAt: source.capturedAt, source: 'measured-summary', engineMaxRpm: observed.engineMaxRpm, peakPowerRpm: observed.observedPeakPower!.rpm,
        peakTorqueRpm: observed.observedPeakTorque!.rpm, acceptedMs: observed.acceptedMs, bins: observed.bins } : null,
      inputs: Object.fromEntries(required.map(key => [key, { value: Number(effective[key]), unit: roadInputUnits[key] || '', source: 'game-confirmed' }])), formulaVersion: 'road-initial/neutral-v1' });
    if (result) setConfirmed(false);
  };
  return <section className="glass-panel p-4 d-flex flex-column gap-3">
    <h2 className="h5">{t('Build a Road baseline by section')}</h2>
    <p>{t('Enter only what this section needs. Existing profile values are reused records until confirmed in game. Outputs are initial estimates with no seasonal correction.')}</p>
    <label>{t('Section')}<select className="form-select" value={group} onChange={e => setGroup(e.target.value as RoadBaselineGroup)}>{Object.keys(roadInputGroups).map(key => <option key={key} value={key}>{t(key)}</option>)}</select></label>
    <div className="row g-3">{required.map(key => <label className="col-sm-6 col-xl-4" key={key}>{t(key)} {roadInputUnits[key] || ''}<input type="number" step="any" className="form-control" value={effective[key] || ''} onChange={e => setInputs({ ...inputs, [key]: e.target.value })} />
      {inherited[key] && !inputs[key] && <small className="text-body-secondary">{t('Reused record; confirm before use')}</small>}</label>)}</div>
    {group === 'gearing' && <>
      <EngineObservationHistory entries={engine.archive} compatibleIds={engine.compatible.map(e => e.id)} reuse={engine.reuse} storageError={engine.storageError} />
      {!observed ? <TuningMeasurementStep key={carId} carId={carId} enabled={true} onComplete={engine.complete} /> : <p>{t('Measured engine limit')}: {observed.engineMaxRpm} RPM <button className="btn btn-sm btn-outline-secondary" onClick={engine.invalidate}>{t('Collect driving data again')}</button></p>}
    </>}
    {estimates ? <RoadGameRanges estimates={estimates} ranges={allRanges} onChange={setRanges} /> : <p className="small text-body-secondary">{t('Complete this section’s required values to check the game ranges.')}</p>}
    <label className="d-flex gap-2"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />{t('I confirmed these vehicle inputs, adjustable controls, ranges and steps in game.')}</label>
    <div className="d-flex flex-wrap gap-2"><button className="btn btn-primary" disabled={busy || !ready} onClick={() => void saveDraft()}>{t('Save this section to baseline A')}</button>
      <button className="btn btn-outline-secondary" disabled={!parent} onClick={() => parent && onReady(parent.id)}>{t('Continue with the saved baseline')}</button></div>
    <p className="small text-body-secondary">{t('Each saved section is a partial draft. Unlisted controls remain unknown. Apply and confirm the game values before the first Road run.')}</p>
  </section>;
}
