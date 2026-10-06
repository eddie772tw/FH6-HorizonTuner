/** Read on theme changes, never in the telemetry packet loop. */
export function readCanvasTheme() {
  const style = getComputedStyle(document.documentElement);
  const light = document.documentElement.getAttribute('data-bs-theme') === 'light';
  const value = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    primary: value('--primary', '#00f0ff'),
    secondary: value('--secondary', '#ffaa00'),
    grid: value('--instrument-grid', light ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.06)'),
    track: value('--instrument-track', light ? 'rgba(15, 23, 42, 0.14)' : 'rgba(255, 255, 255, 0.14)'),
    tick: value('--instrument-tick', light ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)'),
    inactive: value('--instrument-inactive', light ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.08)'),
    marker: value('--instrument-history-marker', 'rgba(150, 150, 150, 0.7)'),
    radarGrid: value('--instrument-grid', 'rgba(255,255,255,0.12)'),
    historyLine: value('--instrument-history-marker', light ? 'rgba(15, 23, 42, 0.45)' : 'rgba(255, 255, 255, 0.35)'),
    cold: value('--instrument-cold', '#0088ff'),
    normal: value('--instrument-normal', '#00ff00'),
    hot: value('--instrument-hot', '#ff0000'),
    pointer: value('--instrument-pointer', '#fff'),
    throttle: value('--instrument-throttle', '#00ff66'),
    brake: value('--instrument-brake', '#ff0055'),
    danger: value('--instrument-danger', '#ff003c'),
    warningFill: value('--instrument-warning-fill', 'rgba(255, 0, 60, 0.15)'),
    warningLine: value('--instrument-warning-line', 'rgba(255, 0, 60, 0.2)'),
    linear: value('--instrument-linear', '0') === '1',
    glowStrength: Number(value('--instrument-glow-strength', '1')),
  };
}

export type CanvasTheme = ReturnType<typeof readCanvasTheme>;

export function observeCanvasTheme(update: () => void) {
  const observer = new MutationObserver(update);
  observer.observe(document.documentElement, {
    attributes: true, attributeFilter: ['data-bs-theme', 'data-bs-core', 'data-design-system', 'style'],
  });
  return () => observer.disconnect();
}

/** The same plotting area and data scale; paper instruments use solid ruled guides. */
export function drawTraceGrid(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number, theme: CanvasTheme) {
  const bottom = h - 12 * dpr;
  const plotH = Math.max(10, h - 38 * dpr);
  ctx.strokeStyle = theme.grid;
  ctx.lineWidth = dpr;
  ctx.setLineDash(theme.linear ? [] : [4 * dpr, 4 * dpr]);
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const y = bottom - plotH * i / 4;
    ctx.moveTo(0, y); ctx.lineTo(w, y);
  }
  if (theme.linear) {
    for (let i = 1; i < 4; i++) {
      const x = w * i / 4;
      ctx.moveTo(x, 26 * dpr); ctx.lineTo(x, bottom);
    }
  }
  ctx.stroke();
  ctx.setLineDash([]);
}
