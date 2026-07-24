import { IHudStylePlugin } from '../../../types';

export const SimpleGaugePlugin: IHudStylePlugin = {
  metadata: {
    id: 'simple',
    name: 'Simple Classic Gauge',
    type: 'gauge',
    version: '1.0.0',
    author: 'FH6 HorizonTuner Team',
    description: 'Classic round needle speedometer gauge.',
  },
  mount(container: HTMLElement) {
    container.innerHTML = `<div id="simpleGaugeRoot" style="color: #fff;">Simple Gauge Active</div>`;
  },
  unmount() {
    const root = document.getElementById('simpleGaugeRoot');
    if (root && root.parentElement) root.parentElement.removeChild(root);
  },
  onFrame() {},
};

export default SimpleGaugePlugin;
