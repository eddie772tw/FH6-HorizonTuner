import type { RuntimeInfo } from '../../services/runtimeCapabilities';

/** Only advertise addresses that the running receiver actually bound. */
export function dataOutDestinations(info: RuntimeInfo | null): string[] {
  if (!info?.telemetry.port) return [];
  return info.telemetry.listenAddresses
    .filter(ip => !ip.startsWith('127.') && ip !== '0.0.0.0' && !ip.startsWith('169.254.'))
    .map(ip => `${ip}:${info.telemetry.port}`);
}
