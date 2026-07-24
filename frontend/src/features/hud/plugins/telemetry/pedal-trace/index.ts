import { IHudStylePlugin } from '../../../types';

export const PedalTracePlugin: IHudStylePlugin = {
  metadata: {
    id: 'pedal-trace',
    name: 'Pedal Trace 5s Plugin',
    type: 'telemetry',
    version: '1.0.0',
    author: 'FH6 HorizonTuner Team',
    description: 'Throttle and Brake 5s history waveform.',
  },
  mount() {},
  unmount() {},
  onFrame() {},
};

export default PedalTracePlugin;
