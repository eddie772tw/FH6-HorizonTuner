import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runInNewContext } from 'node:vm';

const hudDir = resolve(process.cwd(), '../hud_overlay/ap1_rev_arc');
const indexPath = resolve(hudDir, 'index.html');
const authorPath = resolve(hudDir, 'author.json');
const cleanBasePath = resolve(hudDir, 'assets/ap1_clean_base.png');
const barsFullPath = resolve(hudDir, 'assets/ap1_bars_full.png');

const modelScope: any = {};
runInNewContext(readFileSync(resolve(hudDir, 'ap1-model.js'), 'utf8'), modelScope);
const Model = modelScope.Ap1Model;

describe('Honda S2000 AP1 (ID4Motion) HUD Contract', () => {
  describe('Assets and Registration Contract', () => {
    it('provides required author metadata and D3D11 base/bar assets', () => {
      expect(existsSync(authorPath)).toBe(true);
      const author = JSON.parse(readFileSync(authorPath, 'utf8'));
      expect(author.name).toContain('S2000');

      expect(existsSync(cleanBasePath)).toBe(true);
      expect(existsSync(barsFullPath)).toBe(true);
    });

    it('registers ap1_rev_arc with HUDCore and documents telemetry proxy design decisions', () => {
      expect(existsSync(indexPath)).toBe(true);
      const html = readFileSync(indexPath, 'utf8');
      expect(html).toContain("HUDCore.registerStyle('ap1_rev_arc'");
      expect(html).toContain('id="ap1Container"');
      expect(html).toContain('id="ap1Canvas"');
      expect(html).toContain('ap1-model.js');
      expect(html).toContain('設計決策紀錄');
    });
  });

  describe('Gear Formatter (Coordinator Contract)', () => {
    it('maps Reverse (0), Neutral (11), and forward gears 1..10 accurately', () => {
      expect(Model.formatGear(0)).toBe('R');
      expect(Model.formatGear('R')).toBe('R');
      expect(Model.formatGear(11)).toBe('N');
      expect(Model.formatGear('N')).toBe('N');

      for (let g = 1; g <= 10; g++) {
        expect(Model.formatGear(g)).toBe(String(g));
      }

      expect(Model.formatGear(-1)).toBe('N');
      expect(Model.formatGear(99)).toBe('N');
    });
  });

  describe('Tachometer Ratio & VTEC Engagement', () => {
    it('clamps RPM ratio to 0..1 across the 11,000 RPM ID4Motion scale', () => {
      expect(Model.calculateRpmRatio(0)).toBe(0);
      expect(Model.calculateRpmRatio(-500)).toBe(0);
      expect(Model.calculateRpmRatio(5500)).toBeCloseTo(0.5, 4);
      expect(Model.calculateRpmRatio(11000)).toBe(1);
      expect(Model.calculateRpmRatio(12500)).toBe(1);
    });

    it('activates VTEC indicator at or above 6,000 RPM', () => {
      expect(Model.isVtecActive(0)).toBe(false);
      expect(Model.isVtecActive(5999)).toBe(false);
      expect(Model.isVtecActive(6000)).toBe(true);
      expect(Model.isVtecActive(9000)).toBe(true);
    });
  });

  describe('Water Temp (TireTemp Source) & Deterministic Oil Vitals Proxy', () => {
    it('converts four-wheel Fahrenheit TireTemp average to Celsius water temperature', () => {
      const tempC = Model.resolveWaterTempFromTireTemp({
        temp_fl: 176,
        temp_fr: 176,
        temp_rl: 194,
        temp_rr: 194,
      });
      expect(tempC).toBeCloseTo(85, 1);
      expect(Model.calculateWaterTempRatio(40)).toBe(0);
      expect(Model.calculateWaterTempRatio(125)).toBe(1);
    });

    it('computes monotonic oil pressure and oil temperature proxy values', () => {
      const idle = Model.calculateOilVitalsProxy(900, 9000, 0.0, 80);
      const redline = Model.calculateOilVitalsProxy(9000, 9000, 1.0, 90);
      expect(redline.oilPress).toBeGreaterThan(idle.oilPress);
      expect(redline.oilTemp).toBeGreaterThan(idle.oilTemp);
    });

    it('resolves fuel_ratio from coordinator payload with bounds clamping', () => {
      expect(Model.resolveFuelRatio({ fuel_ratio: 0.42 })).toBeCloseTo(0.42, 4);
      expect(Model.resolveFuelRatio({ fuel_ratio: 1.5 })).toBe(1);
      expect(Model.resolveFuelRatio({ fuel_ratio: -0.2 })).toBe(0);
    });
  });

  describe('Self-Check Sweep Progress', () => {
    it('returns 0 -> 1 -> 0 sine progression across sweep duration', () => {
      expect(Model.calculateSweepProgress(0, 1200)).toBeCloseTo(0, 5);
      expect(Model.calculateSweepProgress(600, 1200)).toBeCloseTo(1, 5);
      expect(Model.calculateSweepProgress(1200, 1200)).toBeCloseTo(0, 5);
    });
  });
});
