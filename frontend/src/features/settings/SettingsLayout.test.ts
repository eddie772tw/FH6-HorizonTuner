import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('./SettingsView.tsx', import.meta.url)),
  'utf8'
);

describe('SettingsView responsive layout contract', () => {
  it('uses exactly three desktop columns', () => {
    expect(source.match(/col-12 col-lg-4 d-flex flex-column gap-4/g)).toHaveLength(3);
  });

  it('orders display, telemetry, and application concerns from left to right', () => {
    const units = source.indexOf("t('Game Unit Settings')");
    const telemetry = source.indexOf("t('Telemetry Receiver Settings')");
    const developer = source.indexOf("t('Developer Options')");
    const mcp = source.indexOf('<McpSettingsCard />');
    const updates = source.indexOf('<UpdateSettingsCard />');

    expect(units).toBeGreaterThan(-1);
    expect(telemetry).toBeGreaterThan(units);
    expect(developer).toBeGreaterThan(telemetry);
    expect(mcp).toBeGreaterThan(developer);
    expect(updates).toBeGreaterThan(mcp);
  });
});
