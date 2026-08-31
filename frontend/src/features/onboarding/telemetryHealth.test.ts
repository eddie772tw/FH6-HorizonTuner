import { describe, expect, it } from 'vitest';
import { deriveTelemetryHealth, hasCompletedDataOutGuide, hasDismissedDataOutGuide, saveDataOutGuideChoice } from './telemetryHealth';

describe('deriveTelemetryHealth', () => {
  it('reports a usable Data Out frame without claiming an in-game connection', () => {
    const health = deriveTelemetryHealth({ input: { datagramsReceived: 3, packetsParsed: 2, packetsRejected: {}, lastDatagramAt: 123 } }, null, 130);
    expect(health).toMatchObject({ state: 'active', datagramsReceived: 3, validFrames: 2, hasObservedPacket: true, lastPacketAt: 123 });
  });

  it('does not report current reception from stale lifetime counters', () => {
    const health = deriveTelemetryHealth(
      { input: { datagramsReceived: 120, packetsParsed: 119, packetsRejected: {}, lastDatagramAt: 900 } },
      null,
      1_000,
    );

    expect(health).toMatchObject({
      state: 'stale',
      label: 'Data Out not currently receiving',
      datagramsReceived: 120,
      validFrames: 119,
      hasObservedPacket: true,
      lastPacketAt: 900,
    });
  });

  it('reports the no-data state', () => {
    expect(deriveTelemetryHealth({ input: { datagramsReceived: 0, packetsParsed: 0, packetsRejected: {}, lastDatagramAt: null } })).toMatchObject({ state: 'waiting', validFrames: 0 });
  });

  it('preserves actionable parser errors and endpoint failures', () => {
    expect(deriveTelemetryHealth({ input: { datagramsReceived: 1, packetsParsed: 0, packetsRejected: { wrong_length: 1 }, lastDatagramAt: 9 } })).toMatchObject({ state: 'invalid', errors: ['wrong_length (1)'] });
    expect(deriveTelemetryHealth(null, 'Network request failed')).toMatchObject({ state: 'unavailable', errors: ['Network request failed'] });
  });
});

describe('Data Out guide choice', () => {
  it('distinguishes skipped from completed guidance', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
    saveDataOutGuideChoice(storage, 'skipped');
    expect(hasCompletedDataOutGuide(storage)).toBe(false);
    expect(hasDismissedDataOutGuide(storage)).toBe(true);
    saveDataOutGuideChoice(storage, 'completed');
    expect(hasCompletedDataOutGuide(storage)).toBe(true);
  });
});
