import { CLASSIC_JDM_STYLE_ID } from './classic_jdm/config';
import { S650_HMI_STYLE_ID } from './s650/config';

export type HudCapabilityStatus = 'available' | 'unsupported' | 'degraded';

export interface HudCapability {
  status: HudCapabilityStatus;
  detail: string;
}

export interface HudCapabilitySet {
  nativeWindow: HudCapability;
  monitorSelection: HudCapability;
  clickThrough: HudCapability;
  reload: HudCapability;
  persistedConfig: HudCapability;
  classicJdmControls: HudCapability;
  s650Controls: HudCapability;
}

export interface HudCapabilityInput {
  nativeAvailable: boolean;
  hudStyle: string;
  nativeDegraded?: boolean;
}

function nativeCapability(input: HudCapabilityInput, feature: string): HudCapability {
  if (!input.nativeAvailable) {
    return { status: 'unsupported', detail: `${feature} requires the native HUD host.` };
  }
  if (input.nativeDegraded) {
    return { status: 'degraded', detail: `${feature} is available with a degraded native host.` };
  }
  return { status: 'available', detail: `${feature} is available.` };
}

export function deriveHudCapabilities(input: HudCapabilityInput): HudCapabilitySet {
  return {
    nativeWindow: nativeCapability(input, 'HUD window lifecycle'),
    monitorSelection: nativeCapability(input, 'Monitor selection'),
    clickThrough: nativeCapability(input, 'HUD click-through'),
    reload: nativeCapability(input, 'HUD reload'),
    persistedConfig: {
      status: 'available',
      detail: 'Persisted HUD configuration is managed by the web runtime.',
    },
    classicJdmControls: {
      status: input.hudStyle === CLASSIC_JDM_STYLE_ID ? 'available' : 'available',
      detail: 'Classic JDM controls remain available through the persisted HUD config contract.',
    },
    s650Controls: {
      status: input.hudStyle === S650_HMI_STYLE_ID ? 'available' : 'available',
      detail: 'S650 controls remain available through the persisted HUD config contract.',
    },
  };
}

