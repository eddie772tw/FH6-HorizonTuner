import { describe, expect, it } from 'vitest';
import { getConnectionDiagnostics } from './connectionDiagnostics';

describe('getConnectionDiagnostics', () => {
  it('summarizes both connection sides without exposing a pairing code or credential field', () => {
    expect(getConnectionDiagnostics({
      mode: 'LAN', host: '192.168.1.20', port: '8001', nativeAvailable: true,
      nativeState: 'ERROR', nativeError: 'Pairing failed for ABC123 token=secret-value',
      desktopOnline: false, desktopError: 'authorization: bearer-secret', pairingCode: 'ABC123',
    })).toEqual({
      mode: 'LAN', address: '192.168.1.20:8001', appState: 'ERROR', desktopState: 'Offline',
      appError: 'Pairing failed for [redacted] token=[redacted]', desktopError: 'authorization=[redacted]',
    });
  });

  it('reports when the native bridge is unavailable', () => {
    expect(getConnectionDiagnostics({
      host: '127.0.0.1', port: '8001', nativeAvailable: false, nativeState: 'DISCONNECTED',
      nativeError: null, desktopOnline: true, desktopError: null,
    }).appState).toBe('Unavailable');
  });
});
