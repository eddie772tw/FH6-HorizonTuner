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

// Simple lightweight DOM Mock for Node vitest environment
function setupDOMMock() {
    const elements: Record<string, any> = {};

    function createMockElement(tagName = 'div', id = '') {
        const el: any = {
            tagName,
            id,
            style: {},
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
                measureText: () => ({ width: 10 })
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
    it('getTempColor correctly maps temperature thresholds to hex colors', () => {
        expect(getTempColor(120)).toBe('#0088ff');
        expect(getTempColor(180)).toBe('#00ff00');
        expect(getTempColor(220)).toBe('#ff0000');
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

        // Tire FL Temp: 180°F -> 82°C
        const tireTempFL = document.getElementById('tcTireTempFL')?.textContent;
        expect(tireTempFL).toBe('82°C');
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

    it('elements visibility toggle hides corresponding DOM nodes', () => {
        const manager = createTelemetryCardsManager();
        manager.init(container);

        manager.update({}, {
            elements: {
                showTeleAttitude: false,
                showTeleSuspension: false,
                showTeleTires: false,
                showTelePedals: false,
                showPowerTorque: false
            }
        });

        const attitudeContainer = document.getElementById('tcCenterRadarContainer');
        const pedalContainer = document.getElementById('tcPedalWaveContainer');
        const powerContainer = document.getElementById('tcPowerTorqueContainer');

        expect(attitudeContainer?.style.display).toBe('none');
        expect(pedalContainer?.style.display).toBe('none');
        expect(powerContainer?.style.display).toBe('none');
    });
});
