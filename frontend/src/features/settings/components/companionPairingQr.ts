export interface PairingResponse {
  token: string;
  lan_ips: string[];
  port: number;
  expires_in_secs: number;
  expires_at_unix: number;
  host_name: string;
}

/** Versioned scan payload; the host still enforces the one-time token TTL. */
export function pairingQrContent(pairing: PairingResponse): string {
  return JSON.stringify({
    type: 'horizontuner-pair',
    version: 1,
    token: pairing.token,
    lan_ips: pairing.lan_ips,
    port: pairing.port,
    expires_at_unix: pairing.expires_at_unix,
    host_name: pairing.host_name,
  });
}
