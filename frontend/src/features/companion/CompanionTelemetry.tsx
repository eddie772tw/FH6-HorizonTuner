import { useState } from 'react';
import type { TouchEvent } from 'react';
import TelemetryView from '../telemetry/TelemetryView';
import type { TelemetryCardId } from '../telemetry/components/TelemetryCardShell';
import { useSettings } from '../../context/SettingsContext';

interface CompanionCardConfig {
  id: TelemetryCardId;
  label: string;
  labelKey: string;
  titleKey: string;
}

const CARDS: readonly CompanionCardConfig[] = [
  { id: 'driver', label: 'Driver', labelKey: 'companion.cards.driver', titleKey: 'Driver Inputs & Engine' },
  { id: 'traces', label: 'Traces', labelKey: 'companion.cards.traces', titleKey: 'Live Telemetry Traces' },
  { id: 'dynamics', label: 'Dynamics', labelKey: 'companion.cards.dynamics', titleKey: 'Vehicle Dynamics Overview' },
  { id: 'tires', label: 'Tires', labelKey: 'companion.cards.tires', titleKey: 'Tire Grip & Status' },
  { id: 'suspension', label: 'Suspension', labelKey: 'companion.cards.suspension', titleKey: 'Suspension Travel' },
];

export default function CompanionTelemetry() {
  const { t } = useSettings();
  const [card, setCard] = useState<TelemetryCardId>('driver');
  const start = useState<{ x: number; y: number } | null>(null);
  const cardIds = CARDS.map((c) => c.id);
  const index = cardIds.indexOf(card);
  const companionText = (english: string, key: string) => {
    const translated = t(key);
    return translated === key ? english : translated;
  };
  const onTouchStart = (event: TouchEvent) => { if ((event.target as HTMLElement).closest('button,input,select,textarea')) return; start[1]({ x: event.touches[0].clientX, y: event.touches[0].clientY }); };
  const onTouchEnd = (event: TouchEvent) => { const origin = start[0]; if (!origin) return; const dx = event.changedTouches[0].clientX - origin.x; const dy = event.changedTouches[0].clientY - origin.y; if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) setCard(cardIds[Math.max(0, Math.min(cardIds.length - 1, index + (dx < 0 ? 1 : -1)))]); start[1](null); };
  return <div className="companion-telemetry" data-card={card}>
    <div className="companion-card-picker workspace-tabs nav" role="tablist" aria-label={companionText('Telemetry cards', 'companion.telemetry_cards')}>
      {CARDS.map(({ id, label, labelKey, titleKey }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={card === id}
          aria-label={t(titleKey)}
          className={`nav-link ${card === id ? 'active' : ''}`}
          onClick={() => setCard(id)}
        >
          {companionText(label, labelKey)}
        </button>
      ))}
    </div>
    <div className="companion-telemetry-content" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}><TelemetryView focusedCard={card} pauseForDesktopOverlay={false} /></div>
  </div>;
}
