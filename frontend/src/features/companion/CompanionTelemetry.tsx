import { useState } from 'react';
import type { TouchEvent } from 'react';
import TelemetryView from '../telemetry/TelemetryView';
import type { TelemetryCardId } from '../telemetry/components/TelemetryCardShell';

export default function CompanionTelemetry() {
  const [card, setCard] = useState<TelemetryCardId>('driver');
  const start = useState<{ x: number; y: number } | null>(null);
  const cards: TelemetryCardId[] = ['driver', 'traces', 'dynamics', 'tires', 'suspension'];
  const index = cards.indexOf(card);
  const onTouchStart = (event: TouchEvent) => { if ((event.target as HTMLElement).closest('button,input,select,textarea')) return; start[1]({ x: event.touches[0].clientX, y: event.touches[0].clientY }); };
  const onTouchEnd = (event: TouchEvent) => { const origin = start[0]; if (!origin) return; const dx = event.changedTouches[0].clientX - origin.x; const dy = event.changedTouches[0].clientY - origin.y; if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) setCard(cards[Math.max(0, Math.min(cards.length - 1, index + (dx < 0 ? 1 : -1)))]); start[1](null); };
  return <div className="companion-telemetry" data-card={card}>
    <div className="companion-card-picker" role="tablist" aria-label="Telemetry card">
      {(['driver', 'traces', 'dynamics', 'tires', 'suspension'] as const).map((id) => <button key={id} type="button" role="tab" aria-selected={card === id} className={`btn btn-sm ${card === id ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setCard(id)}>{id}</button>)}
    </div>
    <div className="companion-telemetry-content" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}><TelemetryView focusedCard={card} pauseForDesktopOverlay={false} /></div>
  </div>;
}
