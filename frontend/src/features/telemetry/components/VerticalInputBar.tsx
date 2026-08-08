import React, { useEffect, useRef } from 'react';
import { telemetryEmitter } from '../../../hooks/useTelemetry';

interface VerticalInputBarProps {
  label: string;
  selector: (d: any) => number;
  max?: number;
  color?: string;
}

// --- COMPONENT: VerticalInputBar ---
const VerticalInputBar: React.FC<VerticalInputBarProps> = React.memo(({ label, selector, max = 255, color = 'var(--primary)' }) => {
  const barRef = useRef<HTMLDivElement>(null);
  const peakRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  
  const currentPeak = useRef<number>(0);
  const lastPeakTime = useRef<number>(0);

  useEffect(() => {
    let animId: number;
    let lastDecayTime = 0;

    const handleUpdate = (e: any) => {
      const liveData = e.detail;
      if ((window as any).__IS_HUD_PAUSED__ || !liveData) return;

      const rawVal = selector(liveData);
      const percent = Math.max(0, Math.min(100, (rawVal / max) * 100));

      const now = performance.now();
      if (percent >= currentPeak.current) {
        currentPeak.current = percent;
        lastPeakTime.current = now;
      }

      if (barRef.current) barRef.current.style.height = `${percent}%`;
      if (textRef.current) textRef.current.innerText = `${Math.round(percent)}%`;
    };

    // 策略 D：Peak decay 迴圈降至 ~30Hz（每 33ms 執行一次），減少 4 個實例的 rAF 壓力
    const updatePeakDecay = (timestamp: number) => {
      animId = requestAnimationFrame(updatePeakDecay);
      if (timestamp - lastDecayTime < 33) return; // ~30Hz throttle
      lastDecayTime = timestamp;

      const now = performance.now();
      if (now - lastPeakTime.current > 400 && currentPeak.current > 0) {
        currentPeak.current = Math.max(0, currentPeak.current - 1.8);
      }
      if (peakRef.current) {
        peakRef.current.style.bottom = `${currentPeak.current}%`;
        peakRef.current.style.opacity = currentPeak.current > 1 ? '1' : '0';
      }
    };

    animId = requestAnimationFrame(updatePeakDecay);
    telemetryEmitter.addEventListener('update', handleUpdate);

    return () => {
      cancelAnimationFrame(animId);
      telemetryEmitter.removeEventListener('update', handleUpdate);
    };
  }, [selector, max]);

  return (
    <div className="d-flex flex-column align-items-center gap-1 h-100 flex-grow-1" style={{ maxWidth: '32px', minWidth: '24px' }}>
      <span className="text-body-secondary fs-8 fw-bold text-uppercase text-truncate" style={{ fontSize: '0.68rem', letterSpacing: '0.5px' }}>{label}</span>
      
      <div className="position-relative flex-grow-1 w-100 border rounded-2 overflow-hidden" style={{ background: 'var(--surface-2)', borderColor: 'var(--glass-border) !important' }}>
        {/* Track Guidelines (25%, 50%, 75%) */}
        <div className="position-absolute w-100 pointer-events-none" style={{ top: '25%', height: '1px', background: 'rgba(255,255,255,0.06)' }} />
        <div className="position-absolute w-100 pointer-events-none" style={{ top: '50%', height: '1px', background: 'rgba(255,255,255,0.08)' }} />
        <div className="position-absolute w-100 pointer-events-none" style={{ top: '75%', height: '1px', background: 'rgba(255,255,255,0.06)' }} />

        {/* Dynamic Level Fill */}
        <div
          ref={barRef}
          className="position-absolute start-0 end-0 bottom-0 rounded-bottom-2"
          style={{
            height: '0%',
            background: `linear-gradient(to top, ${color}cc, ${color})`,
            boxShadow: `0 0 10px ${color}a0`,
            transition: 'height 0.04s ease-out'
          }}
        />

        {/* Peak Hold Line */}
        <div
          ref={peakRef}
          className="position-absolute start-0 end-0 pointer-events-none"
          style={{
            height: '2px',
            bottom: '0%',
            background: '#ffffff',
            boxShadow: '0 0 6px rgba(255,255,255,0.9)',
            transition: 'bottom 0.04s ease-out, opacity 0.2s ease',
            zIndex: 3
          }}
        />
      </div>

      <span ref={textRef} className="fw-bold font-monospace text-body fs-8" style={{ fontSize: '0.7rem' }}>0%</span>
    </div>
  );
});

export default VerticalInputBar;
