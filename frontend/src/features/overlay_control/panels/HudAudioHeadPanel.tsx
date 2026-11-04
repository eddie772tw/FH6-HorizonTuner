import { useEffect, useId, useState } from 'react';
import type { HudPanelActions } from '../hudPanelTypes';
import type { HudConfig, HudElements } from '../hudConfig';
import { isHudSettingsTab } from '../hudSettingsFocus';
import { HudRange, HudSettingsSection, HudSwitch } from './HudSettingsControls';

const DECKS = [
  'Pioneer DEH-P6100R', 'Panasonic CQ-VX5500K', 'Pioneer DEX-P1R',
  'Pioneer DEH-P835R', 'Sony CDX-CA860X', 'Alpine CDA-7848',
  'Alpine CDA-9815RB', 'Kenwood KRC-759R', 'JVC KD-LX50R',
];

type Props = HudPanelActions & {
  config: Pick<HudConfig, 'audioHeadDeck' | 'audioHeadEdge' | 'audioHeadOffset' | 'audioHeadCenterOffset' | 'audioHeadScale'> & {
    elements: Pick<HudElements, 'showAudioHead'>;
  };
};

function OffsetInput({ id, value, min, onCommit }: {
  id: string; value: number; min: number; onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  const commit = () => {
    const number = Number(draft);
    if (!draft.trim() || !Number.isFinite(number)) return;
    const next = Math.max(min, Math.min(4000, number));
    setDraft(String(next));
    if (next !== value) onCommit(next);
  };
  return <input id={id} type="number" className="form-control form-control-sm" min={min} max={4000} step={1}
    value={draft} onChange={event => setDraft(event.target.value)}
    onBlur={event => { if (!isHudSettingsTab(event.relatedTarget)) commit(); }}
    onKeyDown={event => {
      if (event.key === 'Enter') { event.preventDefault(); commit(); }
      if (event.key === 'Escape') { event.preventDefault(); setDraft(String(value)); }
    }} />;
}

export function HudAudioHeadPanel({ config, disabled, onConfigPatch, t }: Props) {
  const id = useId();
  return (
    <fieldset disabled={disabled} className="hud-settings-form">
      <legend className="visually-hidden">{t('Audio Head')}</legend>
      <div className="hud-settings-grid">
        <HudSettingsSection title={t('Audio Head')}>
          <HudSwitch label={t('Show Audio Head')} checked={config.elements.showAudioHead === true}
            onChange={showAudioHead => onConfigPatch({ elements: { showAudioHead } })} />
          <p className="text-body-secondary fs-7 m-0">{t('Show alongside any speedometer style.')}</p>
          <div>
            <label htmlFor={`${id}-deck`} className="form-label fs-7 text-body-secondary">{t('Car Audio Head Unit Model')}</label>
            <select id={`${id}-deck`} className="form-select form-select-sm" value={config.audioHeadDeck ?? 0}
              onChange={event => onConfigPatch({ audioHeadDeck: Number(event.target.value) })}>
              {DECKS.map((deck, index) => <option key={deck} value={index}>{deck}</option>)}
            </select>
          </div>
          <HudRange label={t('Audio Head scale')} value={config.audioHeadScale ?? 1} min={0.5} max={2}
            step={0.05} percent numericInput onChange={audioHeadScale => onConfigPatch({ audioHeadScale })} />
          <p className="text-body-secondary fs-7 m-0">{t('This scale affects only Audio Head.')}</p>
          <p className="text-body-secondary fs-7 m-0">{t('Hidden elements can still be configured. Changes apply when you show them again.')}</p>
        </HudSettingsSection>
        <HudSettingsSection title={t('Audio Head position')}>
          <div>
            <label htmlFor={`${id}-edge`} className="form-label fs-7 text-body-secondary">{t('Audio Head Alignment')}</label>
            <select id={`${id}-edge`} className="form-select form-select-sm" value={config.audioHeadEdge ?? 'left'}
              onChange={event => onConfigPatch({ audioHeadEdge: event.target.value as HudConfig['audioHeadEdge'] })}>
              <option value="left">{t('Left Edge')}</option>
              <option value="right">{t('Right Edge')}</option>
              <option value="top">{t('Top Edge')}</option>
              <option value="bottom">{t('Bottom Edge')}</option>
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-offset`} className="form-label fs-7 text-body-secondary">{t('Audio Head Edge Offset')} (px)</label>
            <OffsetInput id={`${id}-offset`} min={0} value={config.audioHeadOffset ?? 0}
              onCommit={audioHeadOffset => onConfigPatch({ audioHeadOffset })} />
            <small className="text-body-secondary">{t('Distance inward from the selected edge.')}</small>
          </div>
          <div>
            <label htmlFor={`${id}-center-offset`} className="form-label fs-7 text-body-secondary">{t('Audio Head Center Offset')} (px)</label>
            <OffsetInput id={`${id}-center-offset`} min={-4000} value={config.audioHeadCenterOffset ?? 0}
              onCommit={audioHeadCenterOffset => onConfigPatch({ audioHeadCenterOffset })} />
            <small className="text-body-secondary">{t('Along the edge: positive moves down or right; negative moves up or left.')}</small>
          </div>
        </HudSettingsSection>
      </div>
    </fieldset>
  );
}
