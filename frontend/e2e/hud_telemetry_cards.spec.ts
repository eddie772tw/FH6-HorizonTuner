import { test, expect } from '@playwright/test';
import http from 'http';
import net from 'net';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const hudDir = path.resolve(__dirname, '../../hud_overlay');

let server: http.Server;
let serverUrl = '';

const mimeTypes: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.json': 'application/json'
};

test.beforeAll(async () => {
    server = http.createServer((req, res) => {
        const reqPath = req.url === '/' ? '/index.html' : req.url?.split('?')[0] || '/index.html';
        const filePath = path.join(hudDir, reqPath);

        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = path.extname(filePath).toLowerCase();
            const contentType = mimeTypes[ext] || 'application/octet-stream';
            res.writeHead(200, {
                'Content-Type': contentType,
                'Access-Control-Allow-Origin': '*'
            });
            fs.createReadStream(filePath).pipe(res);
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
        }
    });

    await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            const address = server.address() as net.AddressInfo;
            serverUrl = `http://127.0.0.1:${address.port}`;
            resolve();
        });
    });
});

test.afterAll(async () => {
    if (server) {
        await new Promise<void>((resolve) => server.close(() => resolve()));
    }
});

test.describe('HUD Telemetry Cards DOM & Rendering Verification', () => {
    test('HUD Overlay index page mounts TelemetryCards cluster correctly', async ({ page }) => {
        await page.goto(`${serverUrl}/index.html`);
        await page.waitForLoadState('networkidle');

        // Check central mount container and cluster elements
        const cluster = page.locator('#tcClusterWrapper');
        await expect(cluster).toBeVisible();

        const radar = page.locator('#tcCenterRadarContainer');
        await expect(radar).toBeVisible();

        const cornerFL = page.locator('#tcCornerFL');
        await expect(cornerFL).toBeVisible();
    });

    test('Telemetry update accurately updates DOM text & calculates Lat/Lon G', async ({ page }) => {
        await page.goto(`${serverUrl}/index.html`);
        await page.waitForLoadState('networkidle');

        // Inject telemetry frame data via window.TelemetryCardsManager
        await page.evaluate(() => {
            if (window.TelemetryCardsManager) {
                window.TelemetryCardsManager.update({
                    accel_x: -14.715, // -1.5G lateral
                    accel_z: 19.62,   // 2.0G longitudinal
                    susp_fl: 0.82,
                    temp_fl: 195,
                    throttle: 0.95,
                    brake: 0.0,
                    rpm: 7200,
                    power: 580,
                    torque: 610,
                    isMetric: true
                }, {
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
            }
        });

        // Assert LAT G readout text: abs(-(-14.715)/9.81) = 1.50
        const latGText = await page.locator('#tcLatG').textContent();
        expect(latGText).toBe('1.50');

        // Assert LON G readout text: abs(19.62/9.81) = 2.00
        const lonGText = await page.locator('#tcLonG').textContent();
        expect(lonGText).toBe('2.00');

        // Assert Suspension FL travel readout text: 0.82
        const suspText = await page.locator('#tcSuspTextFL').textContent();
        expect(suspText).toBe('0.82');

        // Assert Tire Temp FL text: 195°F -> 91°C
        const tireTempText = await page.locator('#tcTireTempFL').textContent();
        expect(tireTempText).toBe('91°C');
    });

    test('Canvas 2D contexts in Telemetry Cards render without exceptions', async ({ page }) => {
        await page.goto(`${serverUrl}/index.html`);
        await page.waitForLoadState('networkidle');

        const allCanvasesReady = await page.evaluate(() => {
            const canvasIds = [
                'tcPedalWave',
                'tcPowerTorqueChart',
                'tcSuspWaveFL',
                'tcTireRadarFL',
                'tcTireHistFL'
            ];
            return canvasIds.every(id => {
                const canvas = document.getElementById(id) as HTMLCanvasElement | null;
                return canvas !== null && canvas.getContext('2d') !== null;
            });
        });

        expect(allCanvasesReady).toBeTruthy();
    });

    test('Visibility toggles hide/show component blocks accurately', async ({ page }) => {
        await page.goto(`${serverUrl}/index.html`);
        await page.waitForLoadState('networkidle');

        // Toggle attitude radar & pedal trace off
        await page.evaluate(() => {
            if (window.TelemetryCardsManager) {
                window.TelemetryCardsManager.update({}, {
                    elements: {
                        showTeleAttitude: false,
                        showTelePedals: false
                    }
                });
            }
        });

        const radarDisplay = await page.locator('#tcCenterRadarContainer').evaluate(el => el.style.display);
        const pedalDisplay = await page.locator('#tcPedalWaveContainer').evaluate(el => el.style.display);

        expect(radarDisplay).toBe('none');
        expect(pedalDisplay).toBe('none');
    });
});
