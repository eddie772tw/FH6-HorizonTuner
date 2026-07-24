import { IHudStylePlugin } from '../../../types';

export const GForceRadarPlugin: IHudStylePlugin = {
  metadata: {
    id: 'gforce-radar',
    name: 'G-Force Radar Plugin',
    type: 'telemetry',
    version: '1.0.0',
    author: 'FH6 HorizonTuner Team',
    description: 'Central G-Force vector radar cluster.',
  },
  mount() {},
  unmount() {},
  onFrame() {},
};

export default GForceRadarPlugin;
