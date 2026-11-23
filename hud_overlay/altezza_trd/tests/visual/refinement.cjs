// Serve the repository root, then run with HUD_ORIGIN and PLAYWRIGHT_MODULE_PATH.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

(async () => {
    const out = path.resolve(__dirname, '../../../../docs/visual-review/altezza');
    const browser = await chromium.launch({
        ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
    });
    try {
        const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
        const errors = [];
        page.on('pageerror', error => errors.push(String(error)));
        await page.goto((process.env.HUD_ORIGIN || 'http://localhost:8174') + '/hud_overlay/altezza_trd/index.html');
        await page.addStyleTag({ content: 'html { background: #20242b !important; }' });
        for (const mode of ['tach', 'speed']) {
            await page.evaluate(mode => HUDCore.handleMessage('config', { data: {
                altezzaCenterDial: mode, scale: 1, unit: 'kmh'
            } }), mode);
            await page.locator('#altezzaPlate').evaluate(image => image.decode());
            for (const [name, speed, gear, unit] of [
                ['driving', 126, 4, 'kmh'], ['reverse', 0, 0, 'kmh'],
                ['neutral-mph', 100, 11, 'mph'], ['missing', null, null, 'kmh'],
                ['two-digit-gear', 300, 10, 'mph'], ['overflow', 1100, 6, 'kmh']
            ]) {
                await page.evaluate(({ speed, gear, unit }) => HUDCore.handleMessage('hud:frame', { data: {
                    speed_kmh: speed, gear, rpm: 5400, max_rpm: 9000, redlineRpm: 8000,
                    fuel_ratio: .64, displayUnits: { speed: unit }
                } }), { speed, gear, unit });
                assert.equal(await page.locator('.lcd-units span:visible').count(), 1);
                assert.equal(await page.locator('.lcd-units span:visible').innerText(), unit === 'mph' ? 'mph' : 'km/h');
                const file = name === 'driving' ? mode + '.png' : mode + '-' + name + '.png';
                await page.locator('#altezzaContainer').screenshot({ path: path.join(out, file) });
            }
            // Include intermediate side-hand positions in the review, where overlap is most apparent.
            await page.evaluate(() => HUDCore.handleMessage('hud:frame', { data: {
                speed_kmh: 180, gear: 6, rpm: 9000, max_rpm: 9000, fuel_ratio: 1
            } }));
            await page.locator('#altezzaContainer').screenshot({ path: path.join(out, mode + '-full-scale.png') });
        }
        assert.deepEqual(errors, []);
        fs.writeFileSync(path.join(out, 'refinement-checks.json'), JSON.stringify({
            browser: await browser.version(), viewport: [1920, 1080], dpr: 1, scale: 1,
            background: '#20242b', modes: ['tach', 'speed'],
            states: ['driving', 'reverse', 'neutral-mph', 'missing', 'two-digit-gear', 'overflow', 'full-scale'],
            unitExclusivity: 'passed', errors
        }, null, 2) + '\n');
    } finally { await browser.close(); }
})();
