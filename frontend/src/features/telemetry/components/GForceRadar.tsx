import React, { useState, useEffect, useRef } from 'react';
import { telemetryEmitter } from '../../../hooks/useTelemetry';
import { useSettings } from '../../../context/SettingsContext';

// --- COMPONENT: GForceRadar ---
const GForceRadar: React.FC = React.memo(() => {
  const dotRef = useRef<HTMLDivElement>(null);
  const latRef = useRef<HTMLSpanElement>(null);
  const lonRef = useRef<HTMLSpanElement>(null);
  const hist = useRef<{lat: number, lon: number, time: number}[]>([]);
  const lastTimeRef = useRef(performance.now());
  const [markers, setMarkers] = useState<{lat: number, lon: number}[]>([]);
  const prevCar = useRef<number | null>(null);
  const prevRace = useRef<number | null>(null);
  const { t } = useSettings();

  useEffect(() => {
    const handleDraw = (e: any) => {
      const data = e.detail;
      if ((window as any).__IS_HUD_PAUSED__ || !data) return;
      
      if ((prevCar.current !== null && prevCar.current !== data.CarOrdinal) ||
          (prevRace.current !== null && prevRace.current !== data.IsRaceOn)) {
        hist.current = [];
      }
      prevCar.current = data.CarOrdinal;
      prevRace.current = data.IsRaceOn;

      if (data.IsRaceOn !== 1) return;
      
      const now = performance.now();
      const dt = now - lastTimeRef.current;
      lastTimeRef.current = now;

      const lat = -(data.AccelerationX || 0) / 9.81; // Invert X axis (lateral G) per user requirement
      const lon = (data.AccelerationZ || 0) / 9.81; // Keep Y axis (longitudinal G: BRAKE on top)
      const isMoving = Math.abs(data.SpeedMetersPerSecond || 0) > 0.5;

      if (!isMoving) {
        for (let i = 0; i < hist.current.length; i++) hist.current[i].time += dt;
      } else {
        if (hist.current.length < 900) {
          hist.current.push({ lat, lon, time: now });
        } else {
          const old = hist.current.shift();
          if (old) {
            old.lat = lat; old.lon = lon; old.time = now;
            hist.current.push(old);
          }
        }
      }

      if (dotRef.current) {
        let dx = lat * 40;
        let dy = lon * 40;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxR = 73; // radius 80 minus dot radius 7
        if (dist > maxR && dist > 0) {
          dx = (dx / dist) * maxR;
          dy = (dy / dist) * maxR;
        }
        dotRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
      }
      if (latRef.current) latRef.current.innerText = Math.abs(lat).toFixed(2);
      if (lonRef.current) lonRef.current.innerText = Math.abs(lon).toFixed(2);
    };
    telemetryEmitter.addEventListener('update', handleDraw);

    // 5Hz marker updater for React state
    const markerInterval = setInterval(() => {
      const now = performance.now();
      let maxLatL = { lat: 0, lon: 0 }, maxLatR = { lat: 0, lon: 0 };
      let maxLonB = { lat: 0, lon: 0 }, maxLonA = { lat: 0, lon: 0 };
      let maxL_B = { lat: 0, lon: 0 }, maxL_A = { lat: 0, lon: 0 };
      let maxR_B = { lat: 0, lon: 0 }, maxR_A = { lat: 0, lon: 0 };
      let foundAny = false;

      const len = hist.current.length;
      for (let i = 0; i < len; i++) {
        const p = hist.current[i];
        if (now - p.time > 30000) continue;
        foundAny = true;
        if (p.lat < maxLatL.lat) maxLatL = p;
        if (p.lat > maxLatR.lat) maxLatR = p;
        if (p.lon < maxLonB.lon) maxLonB = p;
        if (p.lon > maxLonA.lon) maxLonA = p;
        if (p.lat < 0 && p.lon < 0 && (p.lat + p.lon < maxL_B.lat + maxL_B.lon)) maxL_B = p;
        if (p.lat < 0 && p.lon > 0 && (p.lat - p.lon < maxL_A.lat - maxL_A.lon)) maxL_A = p;
        if (p.lat > 0 && p.lon < 0 && (p.lat - p.lon > maxR_B.lat - maxR_B.lon)) maxR_B = p;
        if (p.lat > 0 && p.lon > 0 && (p.lat + p.lon > maxR_A.lat + maxR_A.lon)) maxR_A = p;
      }

      if (foundAny) {
        setMarkers([maxLatL, maxLatR, maxLonB, maxLonA, maxL_B, maxL_A, maxR_B, maxR_A]);
      } else {
        setMarkers([]);
      }
    }, 200);

    return () => {
      telemetryEmitter.removeEventListener('update', handleDraw);
      clearInterval(markerInterval);
    };
  }, []);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'relative', width: '160px', height: '160px', borderRadius: '50%', background: 'var(--surface-2)', border: '2px solid var(--glass-border)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ position: 'absolute', width: '80px', height: '80px', borderRadius: '50%', border: '1px dashed var(--divider)' }} />
        <div style={{ position: 'absolute', width: '100%', height: '1px', background: 'var(--divider)' }} />
        <div style={{ position: 'absolute', width: '1px', height: '100%', background: 'var(--divider)' }} />
        <span style={{ position: 'absolute', top: '2px', fontSize: '0.6rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{t("BRAKE")}</span>
        <span style={{ position: 'absolute', bottom: '2px', fontSize: '0.6rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{t("ACCEL")}</span>
        <span style={{ position: 'absolute', left: '5px', fontSize: '0.6rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{t("L")}</span>
        <span style={{ position: 'absolute', right: '5px', fontSize: '0.6rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{t("R")}</span>
        
        {markers.map((p, i) => {
          let mx = p.lat * 40;
          let my = p.lon * 40;
          const mDist = Math.sqrt(mx * mx + my * my);
          const maxMR = 77; // radius 80 minus marker half size 3
          if (mDist > maxMR && mDist > 0) {
            mx = (mx / mDist) * maxMR;
            my = (my / mDist) * maxMR;
          }
          return (
            <div key={i} style={{ 
              position: 'absolute', width: '6px', height: '6px', borderRadius: '50%', background: 'var(--text-secondary)', opacity: 0.6,
              top: `${80 + my - 3}px`, 
              left: `${80 + mx - 3}px`
            }} />
          );
        })}
        <div ref={dotRef} style={{
          position: 'absolute', width: '14px', height: '14px', backgroundColor: 'var(--primary)',
          borderRadius: '50%', boxShadow: '0 0 12px var(--primary)'
        }} />
      </div>
      <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.8rem' }}>
        <div style={{ textAlign: 'center' }}>
          <span ref={latRef} style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--primary)' }}>0.00</span>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', marginLeft: '4px' }}>{t("Lat G")}</span>
        </div>
        <div style={{ textAlign: 'center' }}>
          <span ref={lonRef} style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--secondary)' }}>0.00</span>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', marginLeft: '4px' }}>{t("Lon G")}</span>
        </div>
      </div>
    </div>
  );
});

export default GForceRadar;
