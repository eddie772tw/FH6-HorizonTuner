import { useId } from 'react';
import type { HudPanelActions } from '../hudPanelTypes';
import type { HudConfig, HudElements } from '../hudConfig';
import { audioHeadOffsetBounds, readAudioHeadPosition, writeAudioHeadPosition } from '../audioHeadPosition';
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

export function HudAudioHeadPanel({ config, disabled, onConfigPatch, t }: Props) {
  const id = useId();
  const { edge, x, y } = readAudioHeadPosition(config);
  const { minX, maxX, minY, maxY } = audioHeadOffsetBounds(edge);
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
            <select id={`${id}-edge`} className="form-select form-select-sm" value={edge}
              onChange={event => onConfigPatch(writeAudioHeadPosition(event.target.value as typeof edge, x, y))}>
              <option value="left">{t('Left Edge')}</option>
              <option value="right">{t('Right Edge')}</option>
              <option value="top">{t('Top Edge')}</option>
              <option value="bottom">{t('Bottom Edge')}</option>
            </select>
          </div>
          <HudRange label={t('Audio Head X-Offset')} value={x} min={minX} max={maxX} step={1}
            onChange={next => onConfigPatch(writeAudioHeadPosition(edge, next, y))} />
          <HudRange label={t('Audio Head Y-Offset')} value={y} min={minY} max={maxY} step={1}
            onChange={next => onConfigPatch(writeAudioHeadPosition(edge, x, next))} />
          <p className="text-body-secondary fs-7 m-0">{t('Positive X moves right; positive Y moves down. Alignment limits the anchored axis at zero.')}</p>
        </HudSettingsSection>
      </div>
    </fieldset>
  );
}
