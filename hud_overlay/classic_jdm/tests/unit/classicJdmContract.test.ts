import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runInNewContext } from 'node:vm';

const hudDir = resolve(process.cwd(), '../hud_overlay/classic_jdm');
const indexPath = resolve(hudDir, 'index.html');
const authorPath = resolve(hudDir, 'author.json');
const trdLogoPath = resolve(hudDir, 'assets/trd_logo.svg');

const modelScope: any = {};
runInNewContext(readFileSync(resolve(hudDir, 'classic-jdm-model.js'), 'utf8'), modelScope);
const Model = modelScope.ClassicJdmModel;

describe('Classic JDM HUD Contract', () => {
  describe('Assets and Metadata', () => {
    it('provides required author metadata and TRD vector logo', () => {
      expect(existsSync(authorPath)).toBe(true);
      const author = JSON.parse(readFileSync(authorPath, 'utf8'));
      expect(author.name).toBe('Classic JDM');
      expect(author.description).toContain('JDM');

      expect(existsSync(trdLogoPath)).toBe(true);
      const svg = readFileSync(trdLogoPath, 'utf8');
      expect(svg).toContain('<svg');
    });

    it('contains valid index.html registering classic_jdm with HUDCore', () => {
      expect(existsSync(indexPath)).toBe(true);
      const html = readFileSync(indexPath, 'utf8');
      expect(html).toContain("HUDCore.registerStyle('classic_jdm'");
      expect(html).toContain("id=\"classicJdmContainer\"");
      expect(html).toContain("id=\"classicJdmCanvas\"");
      expect(html).toContain("classic-jdm-model.js");
    });

    it('positions Defi brand markings above needle center on both speedometer and tachometer', () => {
      const html = readFileSync(indexPath, 'utf8');
      const defiAboveMatches = html.match(/ctx\.fillText\('Defi',\s*cx,\s*cy\s*-\s*r\s*\*\s*0\.44\);/g);
      expect(defiAboveMatches).not.toBeNull();
      expect(defiAboveMatches?.length).toBe(2);
    });
  });

  describe('Container Geometry', () => {
    it('returns 800x440 for triple aux gauge mode and 540x300 for dual cluster mode', () => {
      const triple = Model.getContainerGeometry(true);
      expect(triple.width).toBe(800);
      expect(triple.height).toBe(440);

      const dual = Model.getContainerGeometry(false);
      expect(dual.width).toBe(540);
      expect(dual.height).toBe(300);

      // Default should be triple
      const def = Model.getContainerGeometry();
      expect(def.width).toBe(800);
      expect(def.height).toBe(440);
    });
  });

  describe('7-Segment LED Gear Formatter', () => {
    it('formats reverse, neutral, forward gears 1-10, and unknown states', () => {
      expect(Model.format7SegmentGear(0).char).toBe('R');
      expect(Model.format7SegmentGear('R').char).toBe('R');
      expect(Model.format7SegmentGear(11).char).toBe('N');
      expect(Model.format7SegmentGear('N').char).toBe('N');

      for (let g = 1; g <= 10; g++) {
        expect(Model.format7SegmentGear(g).char).toBe(String(g));
        expect(Model.format7SegmentGear(g).rawGear).toBe(g);
      }

      expect(Model.format7SegmentGear(99).char).toBe('-');
      expect(Model.format7SegmentGear(null).char).toBe('-');
    });
  });

  describe('Tachometer Angle Calculations', () => {
    it('calculates TRD 11,000 RPM non-linear compressed angle curve', () => {
      const zero = Model.calculateTachAngle(0, 11000, 'trd');
      const three = Model.calculateTachAngle(3000, 11000, 'trd');
      const seven = Model.calculateTachAngle(7000, 11000, 'trd');
      const eleven = Model.calculateTachAngle(11000, 11000, 'trd');

      const totalSpan = eleven - zero;
      expect((three - zero) / totalSpan).toBeCloseTo(0.18);
      expect((seven - three) / totalSpan).toBeCloseTo(0.38);
      expect((eleven - seven) / totalSpan).toBeCloseTo(0.44);
    });

    it('calculates Defi Advance BF linear tachometer angle curve', () => {
      const zero = Model.calculateTachAngle(0, 11000, 'defi');
      const mid = Model.calculateTachAngle(5500, 11000, 'defi');
      const max = Model.calculateTachAngle(11000, 11000, 'defi');

      expect((mid - zero) / (max - zero)).toBeCloseTo(0.5);
    });
  });

  describe('Speedometer Angle Calculations', () => {
    it('calculates 0-200 km/h speedometer angle with arcade quadrant anchors', () => {
      const deg = (rad: number) => (rad * 180) / Math.PI;

      expect(deg(Model.calculateSpeedAngle(0, true))).toBeCloseTo(150);
      expect(deg(Model.calculateSpeedAngle(20, true))).toBeCloseTo(180);
      expect(deg(Model.calculateSpeedAngle(80, true))).toBeCloseTo(270);
      expect(deg(Model.calculateSpeedAngle(140, true))).toBeCloseTo(360);
      expect(deg(Model.calculateSpeedAngle(200, true))).toBeCloseTo(450);
    });
  });

  describe('Dynamic Auxiliary Gauges Resolution', () => {
    const mockTelemetry = {
      TireTemp: [176, 176, 194, 194], // in °F: FL=80°C, FR=80°C, RL=90°C, RR=90°C
      NormalizedSuspensionTravel: [0.2, 0.2, 0.4, 0.4],
      TireSlipRatio: [0.05, 0.05, 0.15, 0.15],
      Boost: 14.5,
    };

    it('resolves four-wheel tire temperature average (tire_temp_4w)', () => {
      const res = Model.resolveAuxGauge('tire_temp_4w', mockTelemetry, true);
      expect(res.label).toBe('TIRE 4W');
      expect(res.unit).toBe('°C');
      // 4-wheel avg: (80 + 80 + 90 + 90) / 4 = 85°C
      expect(res.value).toBeCloseTo(85, 1);
    });

    it('resolves rear tire temperature average (tire_temp_rear)', () => {
      const res = Model.resolveAuxGauge('tire_temp_rear', mockTelemetry, true);
      expect(res.label).toBe('TIRE RR');
      expect(res.unit).toBe('°C');
      // Rear avg: (90 + 90) / 2 = 90°C
      expect(res.value).toBeCloseTo(90, 1);
    });

    it('resolves front tire temperature average (tire_temp_front)', () => {
      const res = Model.resolveAuxGauge('tire_temp_front', mockTelemetry, true);
      expect(res.label).toBe('TIRE FR');
      expect(res.unit).toBe('°C');
      // Front avg: (80 + 80) / 2 = 80°C
      expect(res.value).toBeCloseTo(80, 1);
    });

    it('resolves suspension travel averages (4W, Front, Rear)', () => {
      const susp4w = Model.resolveAuxGauge('susp_travel_4w', mockTelemetry, true);
      expect(susp4w.label).toBe('SUSP 4W');
      expect(susp4w.unit).toBe('%');
      expect(susp4w.value).toBeCloseTo(30, 1);

      const suspFr = Model.resolveAuxGauge('susp_travel_front', mockTelemetry, true);
      expect(suspFr.label).toBe('SUSP FR');
      expect(suspFr.value).toBeCloseTo(20, 1);

      const suspRr = Model.resolveAuxGauge('susp_travel_rear', mockTelemetry, true);
      expect(suspRr.label).toBe('SUSP RR');
      expect(suspRr.value).toBeCloseTo(40, 1);
    });

    it('resolves slip ratio average', () => {
      const slip = Model.resolveAuxGauge('slip_ratio_4w', mockTelemetry, true);
      expect(slip.label).toBe('SLIP 4W');
      expect(slip.unit).toBe('%');
      expect(slip.value).toBeCloseTo(10, 1);
    });
  });

  describe('Sweep / Self-Check Animation Progress', () => {
    it('produces smooth zero-to-one-to-zero progress curve', () => {
      expect(Model.calculateSweepProgress(0, 1200)).toBe(0);
      expect(Model.calculateSweepProgress(600, 1200)).toBe(1.0);
      expect(Model.calculateSweepProgress(1200, 1200)).toBe(0);
    });
  });
});
