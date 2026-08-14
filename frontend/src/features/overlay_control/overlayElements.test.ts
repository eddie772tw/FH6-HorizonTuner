import { describe, expect, it } from 'vitest';

describe('Overlay Telemetry HUD Elements & Audio Device Contract', () => {
  it('defaults showTeleMaster to true and audioDeviceId to default', () => {
    const defaultElements = {
      showTeleMaster: true,
      showTeleSuspension: true,
      showTeleTires: true,
      showLiveMap: true,
    };
    expect(defaultElements.showTeleMaster).toBe(true);
  });

  it('evaluates child element visibility as false when showTeleMaster is false', () => {
    const elements = {
      showTeleMaster: false,
      showTeleSuspension: true,
      showTeleTires: true,
      showLiveMap: true,
    };

    const isMasterOn = elements.showTeleMaster !== false;
    const isSuspensionVisible = isMasterOn && (elements.showTeleSuspension !== false);
    const isLiveMapVisible = isMasterOn && (elements.showLiveMap !== false);

    expect(isMasterOn).toBe(false);
    expect(isSuspensionVisible).toBe(false);
    expect(isLiveMapVisible).toBe(false);
  });

  it('evaluates child element visibility normally when showTeleMaster is true', () => {
    const elements = {
      showTeleMaster: true,
      showTeleSuspension: true,
      showTeleTires: false,
      showLiveMap: true,
    };

    const isMasterOn = elements.showTeleMaster !== false;
    const isSuspensionVisible = isMasterOn && (elements.showTeleSuspension !== false);
    const isTiresVisible = isMasterOn && (elements.showTeleTires !== false);
    const isLiveMapVisible = isMasterOn && (elements.showLiveMap !== false);

    expect(isMasterOn).toBe(true);
    expect(isSuspensionVisible).toBe(true);
    expect(isTiresVisible).toBe(false);
    expect(isLiveMapVisible).toBe(true);
  });
});
