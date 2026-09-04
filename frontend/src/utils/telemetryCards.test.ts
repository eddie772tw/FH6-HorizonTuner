import { describe, it, expect, beforeEach } from 'vitest';
import {
    getTempColor,
    fahrenheitToCelsius,
    celsiusToFahrenheit,
    radToDeg,
    clamp
} from '../../../hud_overlay/shared/telemetry-cards/utils.js';
import { getClusterHTML } from '../../../hud_overlay/shared/telemetry-cards/template.js';
import { createTelemetryCardsManager } from '../../../hud_overlay/shared/telemetry-cards/manager.js';
import { classifyLiveMapDrift } from '../../../hud_overlay/shared/telemetry-cards/live-map.js';

// Simple lightweight DOM Mock for Node vitest environment
function setupDOMMock() {
    const elements: Record<string, any> = {};

    function createMockElement(tagName = 'div', id = '') {
        const customStyles: Record<string, string> = {};
        const classSet = new Set<string>();
        const el: any = {
            tagName,
            id,
            classList: {
                add: (cls: string) => classSet.add(cls),
                remove: (cls: string) => classSet.delete(cls),
                contains: (cls: string) => classSet.has(cls)
            },
            style: {
                setProperty: (prop: string, val: string) => { customStyles[prop] = val; },
                getPropertyValue: (prop: string) => customStyles[prop] || ''
            },
            textContent: '',
            clientWidth: 200,
            clientHeight: 200,
            width: 200,
            height: 200,
            children: [],
            innerHTML: '',
            getContext: () => ({
                clearRect: () => {},
                fillRect: () => {},
                stroke: () => {},
                beginPath: () => {},
                moveTo: () => {},
                lineTo: () => {},
                arc: () => {},
                fill: () => {},
                fillText: () => {},
                measureText: () => ({ width: 10 }),
                save: () => {},
                restore: () => {}
            }),
            appendChild: (child: any) => {
                el.children.push(child);
                if (child.id) elements[child.id] = child;
                return child;
            }
        };
        if (id) elements[id] = el;
        return el;
    }

    const mockDocument: any = {
        createElement: (tagName: string) => createMockElement(tagName),
        getElementById: (id: string) => {
            if (!elements[id]) {
                elements[id] = createMockElement('div', id);
            }
            return elements[id];
        },
        body: createMockElement('body', 'body')
    };

    (globalThis as any).document = mockDocument;
    (globalThis as any).performance = (globalThis as any).performance || { now: () => Date.now() };

    return { mockDocument, elements };
}

describe('HUD Telemetry Cards Utilities', () => {
    it('classifies drift from the fixed four-wheel slip tuple without changing threshold semantics', () => {
        expect(classifyLiveMapDrift({ TireSlipRatio: [0.1, 0.2, 0.3, 0.39] }, 100)).toBe(false);
        expect(classifyLiveMapDrift({ TireSlipRatio: [0.1, 0.2, 0.3, 0.4] }, 100)).toBe(false);
        expect(classifyLiveMapDrift({ TireSlipRatio: [0.1, 0.2, 0.3, 0.41] }, 0)).toBe(true);
    });

    it('retains speed fallback and malformed-slip fail-closed behavior', () => {
        expect(classifyLiveMapDrift({}, 21)).toBe(true);
        expect(classifyLiveMapDrift({}, 20)).toBe(false);
        expect(classifyLiveMapDrift(null, 100)).toBe(false);
        expect(classifyLiveMapDrift({ TireSlipRatio: [Number.NaN, 0.5, 0, 0] }, 100)).toBe(false);
    });

    it('getTempColor correctly maps temperature thresholds to hex colors', () => {
        expect(getTempColor(150)).toBe('#0088ff');
        expect(getTempColor(180)).toBe('#00ff00');
        expect(getTempColor(230)).toBe('#ff0000');
    });

    it('unit conversions convert temperatures and angles accurately', () => {
        expect(fahrenheitToCelsius(32)).toBe(0);
        expect(fahrenheitToCelsius(212)).toBe(100);
        expect(celsiusToFahrenheit(0)).toBe(32);
        expect(celsiusToFahrenheit(100)).toBe(212);
        expect(radToDeg(Math.PI)).toBeCloseTo(180, 5);
        expect(radToDeg(Math.PI / 2)).toBeCloseTo(90, 5);
    });

    it('clamp correctly bounds numeric values', () => {
        expect(clamp(5, 0, 10)).toBe(5);
        expect(clamp(-5, 0, 10)).toBe(0);
        expect(clamp(15, 0, 10)).toBe(10);
    });

    it('getClusterHTML generates valid cluster layout container HTML string', () => {
        const html = getClusterHTML(1.0, 0.85);
        expect(html).toContain('tcClusterWrapper');
        expect(html).toContain('tcGRadarCircle');
        expect(html).toContain('tcCornerFL');
        expect(html).toContain('tcPedalWaveContainer');
        expect(html).toContain('tcPowerTorqueContainer');
    });
});

describe('TelemetryCardsManager Lifecycle & DOM Interaction', () => {
    let container: any;

    beforeEach(() => {
        const { mockDocument } = setupDOMMock();
        container = mockDocument.createElement('div');
    });

    it('init creates the cluster DOM structure', () => {
        const manager = createTelemetryCardsManager();
        manager.init(container);

        expect(manager.initialized).toBe(true);
        expect(container.innerHTML).toContain('tcClusterWrapper');
    });

    it('update parses telemetry data and updates DOM text nodes', () => {
        const manager = createTelemetryCardsManager();
        manager.init(container);

        const mockData = {
            accel_x: -19.62, // -2G lateral
            accel_z: 9.81,   // 1G longitudinal
            susp_fl: 0.75,
            susp_fr: 0.50,
            susp_rl: 0.40,
            susp_rr: 0.30,
            temp_fl: 180,
            slip_fl: 0.15,
            slip_angle_fl: 0.05,
            throttle: 0.8,
            brake: 0.2,
            rpm: 6500,
            power: 450,
            torque: 520,
            isMetric: true
        };

        manager.update(mockData, {
            telemetryScale: 1.0,
            telemetryOpacity: 0.9,
            elements: {
                showTeleAttitude: true,
                showTeleSuspension: true,
                showTeleTires: true,
                showTelePedals: true,
                showPowerTorque: true
            }
        });

        // LAT G: abs(-(-19.62)/9.81) = 2.00
        const latG = document.getElementById('tcLatG')?.textContent;
        expect(latG).toBe('2.00');

        // LON G: abs(9.81/9.81) = 1.00
        const lonG = document.getElementById('tcLonG')?.textContent;
        expect(lonG).toBe('1.00');

        // Suspension FL travel: 0.75
        const suspFL = document.getElementById('tcSuspTextFL')?.textContent;
        expect(suspFL).toBe('0.75');

        // Tire FL Temp: header text element is hidden in favor of canvas white line indicator
        const tireTempFL = document.getElementById('tcTireTempFL');
        expect(tireTempFL?.style.display).toBe('none');
    });

    it('buffer bounds are enforced under rapid updates', () => {
        const manager = createTelemetryCardsManager();
        manager.init(container);

        // Push 350 updates into manager (exceeding pedal limit of 300)
        for (let i = 0; i < 350; i++) {
            manager.update({
                throttle: (i % 100) / 100,
                brake: (i % 50) / 50,
                temp_fl: 180,
                susp_fl: 0.5
            });
        }

        expect(manager.pedalHist.length).toBeLessThanOrEqual(300);
        expect(manager.tireHist[0].length).toBeLessThanOrEqual(180);
        expect(manager.suspHist[0].length).toBeLessThanOrEqual(150);
    });

    it('elements visibility toggle hides corresponding DOM nodes including Live Map', () => {
        const manager = createTelemetryCardsManager();
        manager.init(container);

        manager.update(null, {
            elements: {
                showTeleAttitude: false,
                showTeleSuspension: false,
                showTeleTires: false,
                showTelePedals: false,
                showPowerTorque: false,
                showLiveMap: false
            }
        });

        const attitudeContainer = document.getElementById('tcCenterRadarContainer');
        const pedalContainer = document.getElementById('tcPedalWaveContainer');
        const powerContainer = document.getElementById('tcPowerTorqueContainer');
        const liveMapContainer = document.getElementById('tcLiveMapContainer');

        expect(attitudeContainer?.style.display).toBe('none');
        expect(pedalContainer?.style.display).toBe('none');
        expect(powerContainer?.style.display).toBe('none');
        expect(liveMapContainer?.style.display).toBe('none');

        // Toggle showLiveMap back to true with null data
        manager.update(null, {
            elements: {
                showLiveMap: true
            }
        });
        expect(liveMapContainer?.style.display).toBe('block');
    });

    it('applies Live Map scale and offset CSS custom properties to tcLiveMapContainer', () => {
        const manager = createTelemetryCardsManager();
        manager.init(container);

        manager.update(null, {
            telemetryLiveMapScale: 1.25,
            telemetryLiveMapOffsetX: 30,
            telemetryLiveMapOffsetY: -20,
            elements: { showLiveMap: true }
        });

        const liveMapContainer = document.getElementById('tcLiveMapContainer');
        expect(liveMapContainer?.style.getPropertyValue('--tc-live-map-scale')).toBe('1.25');
        expect(liveMapContainer?.style.getPropertyValue('--tc-live-map-offset-x')).toBe('30px');
        expect(liveMapContainer?.style.getPropertyValue('--tc-live-map-offset-y')).toBe('-20px');
    });

    it('tire slip radar and tire temp blocks display correctly when showTeleTires is false but sub-toggles are true', () => {
        const manager = createTelemetryCardsManager();
        manager.init(container);

        manager.update({}, {
            elements: {
                showTeleSuspension: true,
                showTeleTires: false,
                showTeleTiresSlip: true,
                showTeleTiresTemp: true
            }
        });

        const suspBlock = document.getElementById('tcSuspBlockFL');
        const slipBlock = document.getElementById('tcSlipBlockFL');
        const tempBlock = document.getElementById('tcTempBlockFL');

        expect(suspBlock?.style.display).toBe('flex');
        expect(slipBlock?.style.display).toBe('flex');
        expect(tempBlock?.style.display).toBe('flex');
    });

    it('corner cards utilize new 2-row layout structure with SLIP A/R header and horizontal TEMP chart', () => {
        const html = getClusterHTML(1.0, 1.0);

        // Check 2-row layout blocks for FL corner
        expect(html).toContain('id="tcCornerFL"');
        expect(html).toContain('id="tcSuspBlockFL"');
        expect(html).toContain('id="tcSlipBlockFL"');
        expect(html).toContain('id="tcTempBlockFL"');

        // Check SLIP block header contains A: and R: readouts
        expect(html).toContain('tcTireAngFL');
        expect(html).toContain('tcTireRatFL');

        // Check TEMP block contains horizontal labels COLD and HOT
        expect(html).toContain('COLD');
        expect(html).toContain('HOT');

        // Verify canvas width increases for expanded waveform & radar
        expect(html).toContain('id="tcSuspWaveFL" width="130"');
        expect(html).toContain('id="tcTireRadarFL" width="400"');
        expect(html).toContain('id="tcTireHistFL" width="800"');

        // Verify inner corner transform-origins
        expect(html).toMatch(/id="tcCornerFL"[^>]*transform-origin:\s*bottom right/);
        expect(html).toMatch(/id="tcCornerFR"[^>]*transform-origin:\s*bottom left/);
        expect(html).toMatch(/id="tcCornerRL"[^>]*transform-origin:\s*top right/);
        expect(html).toMatch(/id="tcCornerRR"[^>]*transform-origin:\s*top left/);
    });

    it('applies custom gauge primary color to pedal chart and power/torque chart borders', () => {
        const manager = createTelemetryCardsManager();
        manager.init(container);

        const customPrimary = '#ffaa00';
        manager.update({}, {
            useDefaultColors: false,
            customColor: customPrimary,
            elements: {
                showTelePedals: true,
                showPowerTorque: true
            }
        });

        const pedalContainer = document.getElementById('tcPedalWaveContainer');
        const ptContainer = document.getElementById('tcPowerTorqueContainer');

        expect(pedalContainer?.style.getPropertyValue('--card-primary')).toBe(customPrimary);
        expect(ptContainer?.style.getPropertyValue('--card-primary')).toBe(customPrimary);
    });

    it('telemetryCornerEdgeSnap toggles grid container class and edge scale origins', () => {
        const manager = createTelemetryCardsManager();
        manager.init(container);

        manager.update({}, {
            telemetryCornerEdgeSnap: true
        });

        const gridContainer = document.getElementById('tcGridContainer');
        expect(gridContainer?.classList.contains('tc-edge-snapped-corners')).toBe(true);

        const fl = document.getElementById('tcCornerFL');
        const fr = document.getElementById('tcCornerFR');
        const rl = document.getElementById('tcCornerRL');
        const rr = document.getElementById('tcCornerRR');

        expect(fl?.style.transformOrigin).toBe('bottom left');
        expect(fr?.style.transformOrigin).toBe('bottom right');
        expect(rl?.style.transformOrigin).toBe('top left');
        expect(rr?.style.transformOrigin).toBe('top right');
    });

    it('telemetrySideBySideCharts toggles container side-by-side, half-width classes, and container-level transform', () => {
        const manager = createTelemetryCardsManager();
        manager.init(container);

        manager.update({}, {
            telemetrySideBySideCharts: true,
            telemetryMergedChartsOffsetX: 50,
            telemetryMergedChartsScale: 1.2,
            telemetryMergedChartsPosition: 'bottom',
            elements: {
                showTelePedals: true,
                showPowerTorque: true
            }
        });

        const bottomContainer = document.getElementById('tcBottomEdgeContainer');
        const pedalContainer = document.getElementById('tcPedalWaveContainer');
        const ptContainer = document.getElementById('tcPowerTorqueContainer');

        expect(bottomContainer?.classList.contains('tc-side-by-side')).toBe(true);
        expect(bottomContainer?.style.transform).toBe('translateX(50px) scale(1.2)');
        expect(pedalContainer?.classList.contains('tc-half-width')).toBe(true);
        expect(pedalContainer?.style.transform).toBe('none');
        expect(ptContainer?.classList.contains('tc-half-width')).toBe(true);
        expect(ptContainer?.style.transform).toBe('none');
    });

    it('renders Live Map POIs, proximity alert banner, and updates coordinates', () => {
        const manager = createTelemetryCardsManager();
        manager.init(container);

        // Near Horizon Japan Festival (0, 0)
        manager.update({ PositionX: 10, PositionZ: 15, SpeedMetersPerSecond: 25, Yaw: 0.5 }, {
            elements: {
                showLiveMap: true,
                showLiveMapPOIs: true,
                showLiveMapPRStunts: true,
                showLiveMapCollectibles: true,
                showLiveMapHeading: true
            }
        });

        const nearbyEl = document.getElementById('tcLiveMapNearby');
        const coordEl = document.getElementById('tcLiveMapCoord');

        expect(nearbyEl).not.toBeNull();
        expect(nearbyEl?.style.display).toBe('block');
        expect(nearbyEl?.innerText).toContain('NEARBY: Horizon Japan Festival');
        expect(coordEl?.innerText).toBe('X:10 Z:15');
    });
});

