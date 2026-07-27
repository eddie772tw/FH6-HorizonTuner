import { test, expect } from '@playwright/test';

test.describe('Canvas Rendering Verification', () => {
  test('Main Dashboard and Telemetry Canvas should render contexts', async ({ page }) => {
    // Specify full URL for Vite dev server
    await page.goto('http://localhost:1420/');

    // Wait until canvases are injected and visible
    await page.waitForSelector('canvas', { timeout: 10000 });

    // Validate that canvas elements actually contain a 2D rendering context
    const allHaveContext = await page.evaluate(() => {
        const canvases = Array.from(document.querySelectorAll('canvas'));
        return canvases.length > 0 && canvases.every(c => c.getContext('2d') !== null);
    });

    expect(allHaveContext).toBeTruthy();
  });

  // the vite server proxies /hud/ to the backend which serves hud_overlay.
  // Because python server might not run on CI, we can test /hud/simple/index.html instead of 8080.
  // But wait, the backend runs on port 8000, not tested here.
  // However, we did run our own python server on 8080! So we can use that!

  test('HUD Overlay Simple Canvas should render contexts', async ({ page }) => {
    // Port 8080 is where our python HTTP server is hosting the HUD
    await page.goto('http://127.0.0.1:8080/simple/index.html');

    await page.waitForLoadState('networkidle');

    const hasCanvas = await page.evaluate(() => {
      const canvases = Array.from(document.querySelectorAll('canvas'));
      return canvases.length > 0 && canvases.every(c => c.getContext('2d') !== null);
    });

    expect(hasCanvas).toBeTruthy();
  });

  test('HUD Overlay Advanced Canvas should render contexts', async ({ page }) => {
    await page.goto('http://127.0.0.1:8080/advanced/index.html');

    await page.waitForLoadState('networkidle');

    const hasCanvas = await page.evaluate(() => {
      const canvases = Array.from(document.querySelectorAll('canvas'));
      return canvases.length > 0 && canvases.every(c => c.getContext('2d') !== null);
    });

    expect(hasCanvas).toBeTruthy();
  });
});
