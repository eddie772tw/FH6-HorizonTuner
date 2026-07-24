import { IHudStylePlugin } from './types';

class HudPluginRegistry {
  private plugins: Map<string, IHudStylePlugin> = new Map();

  public register(plugin: IHudStylePlugin) {
    if (this.plugins.has(plugin.metadata.id)) {
      console.warn(`HUD Plugin ${plugin.metadata.id} is already registered. Overwriting.`);
    }
    this.plugins.set(plugin.metadata.id, plugin);
  }

  public get(id: string): IHudStylePlugin | undefined {
    return this.plugins.get(id);
  }

  public listPlugins(type?: 'gauge' | 'telemetry'): IHudStylePlugin[] {
    const all = Array.from(this.plugins.values());
    if (type) {
      return all.filter((p) => p.metadata.type === type);
    }
    return all;
  }

  public unregister(id: string) {
    this.plugins.delete(id);
  }
}

export const hudPluginRegistry = new HudPluginRegistry();
