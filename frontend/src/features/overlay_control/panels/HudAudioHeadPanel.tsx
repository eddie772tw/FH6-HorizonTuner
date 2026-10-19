import { useId } from 'react';
import { HudOffsetInput as OffsetInput } from './HudOffsetInput';
import type { HudPanelSharedProps } from '../hudPanelTypes';
import type { HudConfig } from '../hudConfig';

const DECKS = [
  'Pioneer DEH-P6100R', 'Panasonic CQ-VX5500K', 'Pioneer DEX-P1R',
  'Pioneer DEH-P835R', 'Sony CDX-CA860X', 'Alpine CDA-7848',
  'Alpine CDA-9815RB', 'Kenwood KRC-759R', 'JVC KD-LX50R',
];

type Props = Pick<HudPanelSharedProps, 'config' | 'disabled' | 'onConfigPatch'> & {
  t: (key: string) => string;
};

export function HudAudioHeadPanel({ config, disabled, onConfigPatch, t }: Props) {
  const id = useId();
  return (
    <fieldset disabled={disabled} className="border-0 border-top p-0 pt-3 m-0" aria-labelledby={`${id}-title`}>
      <legend id={`${id}-title`} className="fs-6 fw-bold text-primary">{t('Audio Head')}</legend>
      <p className="text-body-secondary fs-7 mb-2">{t('Show alongside any speedometer style.')}</p>
      <label className="form-check form-switch mb-3">
        <input type="checkbox" className="form-check-input" checked={config.elements.showAudioHead === true}
          onChange={event => onConfigPatch({ elements: { ...config.elements, showAudioHead: event.target.checked } })} />
        <span className="form-check-label fs-7">{t('Show Audio Head')}</span>
      </label>
      <div className="row g-3">
        <div className="col-12 col-lg-6">
          <label htmlFor={`${id}-deck`} className="form-label fs-7 text-body-secondary">{t('Car Audio Head Unit Model')}</label>
          <select id={`${id}-deck`} className="form-select form-select-sm" value={config.audioHeadDeck ?? 0}
            onChange={event => onConfigPatch({ audioHeadDeck: Number(event.target.value) })}>
            {DECKS.map((deck, index) => <option key={deck} value={index}>{deck}</option>)}
          </select>
        </div>
        <div className="col-12 col-lg-6">
          <label htmlFor={`${id}-edge`} className="form-label fs-7 text-body-secondary">{t('Audio Head Alignment')}</label>
          <select id={`${id}-edge`} className="form-select form-select-sm" value={config.audioHeadEdge ?? 'left'}
            onChange={event => onConfigPatch({ audioHeadEdge: event.target.value as HudConfig['audioHeadEdge'] })}>
            <option value="left">{t('Left Edge')}</option>
            <option value="right">{t('Right Edge')}</option>
            <option value="top">{t('Top Edge')}</option>
            <option value="bottom">{t('Bottom Edge')}</option>
          </select>
        </div>
        <div className="col-12 col-lg-6">
          <label htmlFor={`${id}-offset`} className="form-label fs-7 text-body-secondary">{t('Audio Head Edge Offset')} (px)</label>
          <OffsetInput id={`${id}-offset`} min={0} value={config.audioHeadOffset ?? 0}
            onCommit={audioHeadOffset => onConfigPatch({ audioHeadOffset })} />
          <small className="text-body-secondary">{t('Distance inward from the selected edge.')}</small>
        </div>
        <div className="col-12 col-lg-6">
          <label htmlFor={`${id}-center-offset`} className="form-label fs-7 text-body-secondary">{t('Audio Head Center Offset')} (px)</label>
          <OffsetInput id={`${id}-center-offset`} min={-4000} value={config.audioHeadCenterOffset ?? 0}
            onCommit={audioHeadCenterOffset => onConfigPatch({ audioHeadCenterOffset })} />
          <small className="text-body-secondary">{t('Along the edge: positive moves down or right; negative moves up or left.')}</small>
        </div>
      </div>
    </fieldset>
  );
}
