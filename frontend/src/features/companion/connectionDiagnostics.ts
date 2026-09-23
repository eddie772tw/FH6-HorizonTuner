export type ConnectionDiagnosticInput = {
  mode?: 'LAN' | 'USB';
  host: string;
  port: string;
  nativeAvailable: boolean;
  nativeState: string;
  nativeError: string | null;
  desktopOnline: boolean;
  desktopError: string | null;
  pairingCode?: string;
};

function redactDiagnosticError(value: string | null, pairingCode?: string): string | null {
  if (!value) return null;
  let safe = value;
  if (pairingCode) safe = safe.split(pairingCode).join('[redacted]');
  safe = safe.replace(/\b(token|pairing[_ -]?code|authorization)\b\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]');
  return safe;
}

export function getConnectionDiagnostics(input: ConnectionDiagnosticInput) {
  return {
    mode: input.mode ?? 'LAN',
    address: `${input.host || '—'}:${input.port || '—'}`,
    appState: input.nativeAvailable ? input.nativeState : 'Unavailable',
    desktopState: input.desktopOnline ? 'Online' : 'Offline',
    appError: redactDiagnosticError(input.nativeError, input.pairingCode),
    desktopError: redactDiagnosticError(input.desktopError, input.pairingCode),
  };
}
