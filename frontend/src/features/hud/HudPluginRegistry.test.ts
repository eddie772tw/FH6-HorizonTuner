import { describe, it, expect, beforeEach, vi } from 'vitest';
import { hudPluginRegistry } from './HudPluginRegistry';
import { IHudStylePlugin } from './types';

describe('HudPluginRegistry', () => {
  beforeEach(() => {
    // Clear registry before each test by listing and unregistering all
    const all = hudPluginRegistry.listPlugins();
    all.forEach(p => hudPluginRegistry.unregister(p.metadata.id));
  });

  const mockGaugePlugin: IHudStylePlugin = {
    metadata: {
      id: 'test-gauge',
      name: 'Test Gauge',
      type: 'gauge',
      description: 'A test gauge plugin'
    },
    component: () => null
  };

  const mockTelemetryPlugin: IHudStylePlugin = {
    metadata: {
      id: 'test-telemetry',
      name: 'Test Telemetry',
      type: 'telemetry',
      description: 'A test telemetry plugin'
    },
    component: () => null
  };

  it('should register and retrieve a plugin', () => {
    hudPluginRegistry.register(mockGaugePlugin);
    const p = hudPluginRegistry.get('test-gauge');
    expect(p).toBeDefined();
    expect(p?.metadata.id).toBe('test-gauge');
  });

  it('should warn when overwriting an existing plugin', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    hudPluginRegistry.register(mockGaugePlugin);
    hudPluginRegistry.register(mockGaugePlugin);
    
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('already registered. Overwriting.')
    );
    consoleSpy.mockRestore();
  });

  it('should list all plugins', () => {
    hudPluginRegistry.register(mockGaugePlugin);
    hudPluginRegistry.register(mockTelemetryPlugin);
    
    const all = hudPluginRegistry.listPlugins();
    expect(all.length).toBe(2);
  });

  it('should list plugins by type', () => {
    hudPluginRegistry.register(mockGaugePlugin);
    hudPluginRegistry.register(mockTelemetryPlugin);
    
    const gauges = hudPluginRegistry.listPlugins('gauge');
    expect(gauges.length).toBe(1);
    expect(gauges[0].metadata.id).toBe('test-gauge');

    const telemetry = hudPluginRegistry.listPlugins('telemetry');
    expect(telemetry.length).toBe(1);
    expect(telemetry[0].metadata.id).toBe('test-telemetry');
  });

  it('should unregister a plugin', () => {
    hudPluginRegistry.register(mockGaugePlugin);
    hudPluginRegistry.unregister('test-gauge');
    
    expect(hudPluginRegistry.get('test-gauge')).toBeUndefined();
    expect(hudPluginRegistry.listPlugins().length).toBe(0);
  });
});
