import React, { useEffect, useRef } from 'react';
import { telemetryEmitter } from '../../../hooks/useTelemetry';

// --- COMPONENT: VerticalInputBar ---
const VerticalInputBar: React.FC<{ label: string; selector: (d: any) => number; max: number; color: string }> = React.memo(({ label, selector, max, color }) => {
  const valRef = useRef<number>(0);
  const barRef = useRef<HTMLDivElement>(null);
  const pctRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const handleUpdate = (e: any) => {
      const liveData = e.detail;
      if ((window as any).__IS_HUD_PAUSED__ || !liveData) return;
      const rawVal = selector(liveData);
      valRef.current = Math.max(0, Math.min(max, rawVal));

      const pct = Math.round((valRef.current / max) * 100);
      if (barRef.current) barRef.current.style.height = `${pct}%`;
      if (pctRef.current) pctRef.current.innerText = `${pct}%`;
    };

    telemetryEmitter.addEventListener('update', handleUpdate);
    return () => {
      telemetryEmitter.removeEventListener('update', handleUpdate);
    };
  }, [selector, max]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
      <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</span>
      <div style={{ position: 'relative', width: '16px', height: '65px', background: 'var(--surface-2)', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--glass-border)' }}>
        <div ref={barRef} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '0%', background: color, borderRadius: '0 0 3px 3px' }} />
      </div>
      <span ref={pctRef} style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: 'var(--text-primary)' }}>0%</span>
    </div>
  );
});

export default VerticalInputBar;
