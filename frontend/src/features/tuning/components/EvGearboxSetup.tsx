import { useId } from 'react';
import type { EvGearboxSetup as Setup } from '../../../domain/tuning/ev/types';

export function EvGearboxSetup({ value, onChange, disabled, t }: {
  value?: Setup; onChange: (value: Setup) => void; disabled: boolean; t: (key: string) => string;
}) {
  const id = useId();
  const setup: Setup = value ?? { finalDrive: null, gearRatios: [null],
    finalDriveAdjustable: false, gearAdjustable: [false], allForwardGearsConfirmed: false };
  const edit = (patch: Partial<Setup>) => onChange({ ...setup, ...patch, allForwardGearsConfirmed: false });
  return <fieldset disabled={disabled} className="d-flex flex-column gap-2">
    <legend className="fs-6">{t('Current EV gearbox in game')}</legend>
    <p className="small text-body-secondary mb-0">{t('List every forward gear. Leave a ratio blank if the game does not show it. Controls are locked unless you explicitly confirm they are adjustable. Changing this setup invalidates the scan.')}</p>
    <div className="row g-2 align-items-end">
      <div className="col-sm-6">
        <label htmlFor={id + '-fd'} className="form-label">{t('Measured final drive')}</label>
        <input id={id + '-fd'} type="number" min="0.01" max="20" step="0.01" className="form-control"
          placeholder={t('Unknown / not shown')} value={setup.finalDrive ?? ''}
          onChange={e => edit({ finalDrive: e.target.value === '' ? null : Number(e.target.value) })} />
      </div>
      <div className="col-sm-6 form-check">
        <input id={id + '-fd-edit'} type="checkbox" className="form-check-input" checked={setup.finalDriveAdjustable}
          onChange={e => edit({ finalDriveAdjustable: e.target.checked })} />
        <label htmlFor={id + '-fd-edit'} className="form-check-label">{t('Final drive is adjustable in game')}</label>
      </div>
    </div>
    {setup.gearRatios.map((ratio, i) => <div className="row g-2 align-items-end" key={i}>
      <div className="col-sm-6">
        <label htmlFor={id + '-gear-' + i} className="form-label">{t('Gear')} {i + 1} · {t('Ratio if shown')}</label>
        <input id={id + '-gear-' + i} type="number" min="0.01" max="20" step="0.01" className="form-control"
          placeholder={t('Unknown / not shown')} value={ratio ?? ''}
          onChange={e => edit({ gearRatios: setup.gearRatios.map((r, index) => index === i ? (e.target.value === '' ? null : Number(e.target.value)) : r) })} />
      </div>
      <div className="col-sm-6 form-check">
        <input id={id + '-gear-edit-' + i} type="checkbox" className="form-check-input" checked={setup.gearAdjustable[i] === true}
          onChange={e => edit({ gearAdjustable: setup.gearRatios.map((_, index) => index === i ? e.target.checked : setup.gearAdjustable[index] === true) })} />
        <label htmlFor={id + '-gear-edit-' + i} className="form-check-label">{t('Gear')} {i + 1} · {t('Ratio adjustable in game')}</label>
      </div>
    </div>)}
    <div className="d-flex gap-2">
      <button type="button" className="btn btn-sm btn-outline-secondary" disabled={setup.gearRatios.length >= 10}
        onClick={() => edit({ gearRatios: [...setup.gearRatios, null], gearAdjustable: [...setup.gearAdjustable, false] })}>{t('Add forward gear')}</button>
      <button type="button" className="btn btn-sm btn-outline-secondary" disabled={setup.gearRatios.length <= 1}
        onClick={() => edit({ gearRatios: setup.gearRatios.slice(0, -1), gearAdjustable: setup.gearAdjustable.slice(0, -1) })}>{t('Remove last gear')}</button>
    </div>
    <div className="form-check">
      <input id={id + '-confirm'} type="checkbox" className="form-check-input" checked={setup.allForwardGearsConfirmed}
        onChange={e => onChange({ ...setup, allForwardGearsConfirmed: e.target.checked })} />
      <label htmlFor={id + '-confirm'} className="form-check-label">{t('All forward gears and their adjustability match the current game setup.')}</label>
    </div>
  </fieldset>;
}
