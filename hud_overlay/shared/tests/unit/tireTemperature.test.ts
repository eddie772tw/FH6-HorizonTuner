import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const scope = { window: {} as Record<string, any> };
vm.runInNewContext(readFileSync(new URL('../../hud-core.js', import.meta.url), 'utf8'), scope);
const averageC = scope.window.HUDCore.getAverageTireTemperatureC;

describe('shared average tire temperature', () => {
    it('uses Fahrenheit for both cold and hot four-wheel frames and normalized aliases', () => {
        expect(averageC({ TireTemp: [50, 68, 86, 104] })).toBeCloseTo(25);
        expect(averageC({ tire_temp_f: [176, 194, 212, 230] })).toBeCloseTo(95);
        expect(averageC({ temp_fl: 50, temp_fr: 68, temp_rl: 86, temp_rr: 104 })).toBeCloseTo(25);
        expect(averageC({ TireTemp: [0, 0, 0, 0] })).toBeCloseTo(-17.777778);
    });

    it('requires four finite numeric samples without fabricating a coolant reading', () => {
        for (const data of [undefined, {}, { TireTemp: [100, 100, 100] },
            { TireTemp: [100, NaN, 100, 100] }, { TireTemp: [100, '100', 100, 100] },
            { coolant_temp: 85, rpm: 8000 }]) {
            expect(averageC(data)).toBeNull();
        }
    });
});
