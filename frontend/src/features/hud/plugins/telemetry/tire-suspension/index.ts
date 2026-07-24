import { IHudStylePlugin } from '../../../types';

export const TireSuspensionPlugin: IHudStylePlugin = {
  metadata: {
    id: 'tire-suspension',
    name: 'Tire & Suspension Cluster Plugin',
    type: 'telemetry',
    version: '1.0.0',
    author: 'FH6 HorizonTuner Team',
    description: '4-Wheel Tire Temps and Suspension Travel Cluster.',
  },
  mount() {},
  unmount() {},
  onFrame() {},
};

export default TireSuspensionPlugin;
