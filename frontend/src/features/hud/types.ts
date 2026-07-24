export type HudPluginType = 'gauge' | 'telemetry';

export interface IHudPluginMetadata {
  id: string;
  name: string;
  type: HudPluginType;
  version: string;
  author: string;
  description: string;
}

export interface IHudStylePlugin {
  metadata: IHudPluginMetadata;
  mount: (container: HTMLElement, config?: any) => void;
  unmount: () => void;
  onFrame: (data: any) => void;
}
