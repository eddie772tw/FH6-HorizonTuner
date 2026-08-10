import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type S650Contract = {
  defaultFrame: { gear: number };
  normalizeFrame: (data: unknown, payload: unknown) => { gear: number };
};

function loadContract(): S650Contract {
  const source = readFileSync(
    resolve(process.cwd(), '../hud_overlay/s650_hmi/assets/s650_contract.js'),
    'utf8',
  );
  const window = {} as { S650HmiContract?: S650Contract };
  new Function('window', source)(window);

  if (!window.S650HmiContract) {
    throw new Error('S650 contract module did not register itself');
  }
  return window.S650HmiContract;
}

describe('S650 frame defaults', () => {
  it('uses first gear as the default game output when telemetry is empty', () => {
    const contract = loadContract();

    expect(contract.defaultFrame.gear).toBe(1);
    expect(contract.normalizeFrame({}, {}).gear).toBe(1);
  });

  it('preserves explicit reverse and neutral gear values', () => {
    const contract = loadContract();

    expect(contract.normalizeFrame({ gear: 0 }, {}).gear).toBe(0);
    expect(contract.normalizeFrame({ gear: 11 }, {}).gear).toBe(11);
  });
});
