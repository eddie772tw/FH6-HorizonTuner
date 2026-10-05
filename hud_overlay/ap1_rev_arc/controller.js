import { createState } from './model.js';
import { createRenderer } from './renderer.js';

const container = document.getElementById('ap1Cluster');
const state = createState();
const renderer = createRenderer(document, container);
let destroyed = false;
let raf = null;
let sweepStarted = null;
const render = () => { if (!destroyed) renderer.render(state.snapshot(performance.now())); };

function stopSweep() {
  if (raf !== null) cancelAnimationFrame(raf);
  raf = null;
  sweepStarted = null;
}
function animate() {
  if (destroyed) return;
  stopSweep();
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || state.snapshot(performance.now()).live) {
    render();
    return;
  }
  sweepStarted = performance.now();
  function tick(now) {
    if (destroyed) return;
    const elapsed = (now - sweepStarted) / 850;
    if (elapsed >= 1) { stopSweep(); render(); return; }
    // Cosmetic segment check only: speed, gear, boost never become pretend values.
    const ratio = Math.sin(Math.PI * elapsed);
    renderer.render(state.snapshot(now), ratio);
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);
}
function configure(config = {}) {
  if (destroyed) return;
  config = config && typeof config === 'object' ? config : {};
  state.configure(config);
  if (config.elements) container.style.display = config.elements.showGauge === false ? 'none' : 'block';
  const glow = typeof config.glowIntensity === 'number' && Number.isFinite(config.glowIntensity) ? Math.max(0, Math.min(2, config.glowIntensity)) : 1;
  container.style.setProperty('--ap1-glow', String(glow));
  render();
}
function destroy() {
  if (destroyed) return;
  destroyed = true;
  stopSweep();
  clearInterval(watchdog);
  state.destroy();
  window.removeEventListener('message', onMessage);
  window.removeEventListener('pagehide', destroy);
}
function onMessage(event) {
  if (event.data?.type === 'hud:destroy') destroy();
}
const watchdog = setInterval(render, 250);
window.addEventListener('message', onMessage);
window.addEventListener('pagehide', destroy);
const fascia = container.querySelector('img');
fascia.addEventListener('error', () => { if (!destroyed) container.classList.add('asset-missing'); });
if (fascia.complete && fascia.naturalWidth === 0) container.classList.add('asset-missing');

window.HUDCore.registerStyle('ap1_rev_arc', {
  containerId: 'ap1Cluster',
  scaleMultiplier: 1,
  onInit: configure,
  onElementsChange(elements) {
    if (!destroyed) container.style.display = elements.showGauge === false ? 'none' : 'block';
  },
  onFrame(data, payload) {
    if (destroyed) return;
    const now = performance.now();
    state.receive(data, payload, now);
    const frame = state.snapshot(now);
    if (frame.live || frame.status === 'DATA ERROR' || frame.status === 'SESSION PAUSED') stopSweep();
    if (sweepStarted === null) render();
  },
  onAnimate: animate,
});
window.HUDCore.init('ap1_rev_arc');
render();
