import { expect, it } from 'vitest';
import { pairingQrContent } from './companionPairingQr';

it('encodes all connection details so Android can pair without manual entry', () => {
  const value = JSON.parse(pairingQrContent({
    token: 'A1B2C3D4E5',
    lan_ips: ['192.168.4.3', '192.168.12.3'],
    port: 8002,
    expires_in_secs: 300,
    expires_at_unix: 1790150000,
    host_name: 'desktop',
  }));
  expect(value).toEqual({
    type: 'horizontuner-pair', version: 1, token: 'A1B2C3D4E5',
    lan_ips: ['192.168.4.3', '192.168.12.3'], port: 8002,
    expires_at_unix: 1790150000, host_name: 'desktop',
  });
});
