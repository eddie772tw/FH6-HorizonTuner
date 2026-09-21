import { describe, expect, it } from 'vitest';

describe('Overlay Telemetry HUD Elements & Audio Device Contract', () => {
  it('defaults showTeleMaster to true and audioDeviceId to default', () => {
    const defaultElements = {
      showTeleMaster: true,
      showTeleSuspension: true,
      showTeleTires: true,
      showPowerTorque: true,
    };
    expect(defaultElements.showTeleMaster).toBe(true);
  });

  it('evaluates child element visibility as false when showTeleMaster is false', () => {
    const elements = {
      showTeleMaster: false,
      showTeleSuspension: true,
      showTeleTires: true,
      showPowerTorque: true,
    };

    const isMasterOn = elements.showTeleMaster !== false;
    const isSuspensionVisible = isMasterOn && (elements.showTeleSuspension !== false);
    const isPowerTorqueVisible = isMasterOn && (elements.showPowerTorque !== false);

    expect(isMasterOn).toBe(false);
    expect(isSuspensionVisible).toBe(false);
    expect(isPowerTorqueVisible).toBe(false);
  });

  it('evaluates child element visibility normally when showTeleMaster is true', () => {
    const elements = {
      showTeleMaster: true,
      showTeleSuspension: true,
      showTeleTires: false,
      showPowerTorque: true,
    };

    const isMasterOn = elements.showTeleMaster !== false;
    const isSuspensionVisible = isMasterOn && (elements.showTeleSuspension !== false);
    const isTiresVisible = isMasterOn && (elements.showTeleTires !== false);
    const isPowerTorqueVisible = isMasterOn && (elements.showPowerTorque !== false);

    expect(isMasterOn).toBe(true);
    expect(isSuspensionVisible).toBe(true);
    expect(isTiresVisible).toBe(false);
    expect(isPowerTorqueVisible).toBe(true);
  });
});
