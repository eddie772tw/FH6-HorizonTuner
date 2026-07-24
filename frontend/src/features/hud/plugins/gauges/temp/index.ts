import { IHudStylePlugin } from '../../../types';

export const TempGaugePlugin: IHudStylePlugin = {
  metadata: {
    id: 'temp',
    name: 'Temp Starter Gauge',
    type: 'gauge',
    version: '1.0.0',
    author: 'FH6 HorizonTuner Team',
    description: 'Minimal starter gauge plugin demonstrating how to create a custom HUD style.',
  },
  mount(container: HTMLElement) {
    container.innerHTML = `
      <div id="tempGaugeRoot" style="padding: 1rem; background: rgba(0,0,0,0.8); color: #00f0ff; border-radius: 8px; font-family: monospace;">
        <h3 style="margin: 0 0 0.5rem 0;">Temp Starter Gauge</h3>
        <div>Speed: <span id="tempSpeed">0</span> KM/H</div>
        <div>RPM: <span id="tempRpm">0</span></div>
        <div>Gear: <span id="tempGear">N</span></div>
      </div>
    `;
  },
  unmount() {
    const root = document.getElementById('tempGaugeRoot');
    if (root && root.parentElement) {
      root.parentElement.removeChild(root);
    }
  },
  onFrame(data: any) {
    const speedEl = document.getElementById('tempSpeed');
    const rpmEl = document.getElementById('tempRpm');
    const gearEl = document.getElementById('tempGear');

    if (speedEl) speedEl.textContent = Math.round((data.speed || 0) * 3.6).toString();
    if (rpmEl) rpmEl.textContent = Math.round(data.CurrentEngineRpm || 0).toString();
    if (gearEl) gearEl.textContent = (data.Gear || 'N').toString();
  },
};

export default TempGaugePlugin;
