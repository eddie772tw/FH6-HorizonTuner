import { changeStackSt8100AlarmMetric, STACK_ST8100_ALARM_METRICS,
  type StackSt8100Alarm, type StackSt8100AlarmMetric, type StackSt8100Alarms } from './config';
import type { StackSt8100DisplayUnits } from './units';
import { StackSt8100ThresholdInput } from './StackSt8100ThresholdInput';

export function StackSt8100AlarmSettings({ id, alarms, units, onChange, t }: {
  id: string;
  alarms: StackSt8100Alarms;
  units: StackSt8100DisplayUnits;
  onChange: (alarms: StackSt8100Alarms) => void;
  t: (key: string) => string;
}) {
  const update = (index: number, alarm: StackSt8100Alarm) => onChange(alarms.map((current, slot) => slot === index ? alarm : current) as StackSt8100Alarms);
  return <div className="d-flex flex-column gap-2">
    {alarms.map((alarm, index) => {
      const slotId = `${id}-alarm-${index + 1}`;
      return <fieldset key={index} className="border rounded p-2 m-0">
        <legend className="float-none w-auto px-1 fs-7 fw-semibold mb-1">{t(`Alarm ${index + 1}`)}</legend>
        <label className="form-check form-switch mb-2">
          <input type="checkbox" className="form-check-input" checked={alarm.enabled}
            onChange={event => update(index, { ...alarm, enabled: event.target.checked })} />
          <span className="form-check-label fs-7">{t('Enabled')}</span>
        </label>
        <div className="row g-2">
          <div className="col-12">
            <label htmlFor={`${slotId}-metric`} className="form-label fs-7 mb-1">{t('Alarm metric')}</label>
            <select id={`${slotId}-metric`} className="form-select form-select-sm" value={alarm.metric}
              onChange={event => update(index, changeStackSt8100AlarmMetric(alarm, event.target.value as StackSt8100AlarmMetric))}>
              {Object.entries(STACK_ST8100_ALARM_METRICS).map(([metric, spec]) => <option key={metric} value={metric}>{t(spec.label)}</option>)}
            </select>
          </div>
          <div className="col-5">
            <label htmlFor={`${slotId}-direction`} className="form-label fs-7 mb-1">{t('Trigger')}</label>
            <select id={`${slotId}-direction`} className="form-select form-select-sm" value={alarm.direction}
              onChange={event => update(index, { ...alarm, direction: event.target.value as StackSt8100Alarm['direction'] })}>
              <option value="high">{t('Above')}</option><option value="low">{t('Below')}</option>
            </select>
          </div>
          <div className="col-7">
            <StackSt8100ThresholdInput key={alarm.metric} id={`${slotId}-threshold`} metric={alarm.metric} value={alarm.threshold}
              units={units} onChange={threshold => update(index, { ...alarm, threshold })} t={t} />
          </div>
        </div>
      </fieldset>;
    })}
    <p className="text-body-secondary fs-8 m-0">{t('Changing an alarm metric resets its threshold and disables that alarm.')}</p>
    <p className="text-body-secondary fs-8 m-0">{t('Alarm thresholds are examples, not tuning recommendations. All three alarms are disabled by default.')}</p>
  </div>;
}
