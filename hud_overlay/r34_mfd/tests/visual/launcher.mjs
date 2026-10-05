import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { serve, baseConfig, rawSample } from './server.mjs';
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const out = path.join(process.env.OUTPUT_DIR || '/tmp/hud-r34-mfd-preview', 'launcher'); await mkdir(out, { recursive: true });
const { server, origin } = await serve(); let browser; const report = { checks: [], errors: [] };
try {
  browser = await chromium.launch({ headless: true, chromiumSandbox: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }); page.on('pageerror', e => report.errors.push(e.message));
  await page.addInitScript(() => { class Socket { static OPEN = 1; constructor() { this.readyState = 1; setTimeout(() => this.onopen?.({}), 20); } send() {} close() { this.readyState = 3; } } window.WebSocket = Socket; });
  await page.goto(origin + '/hud/index.html'); await page.waitForFunction(() => document.querySelector('#hud-iframe')?.contentWindow?.R34Hud);
  let frame = page.frames().find(f => f.url().includes('/r34_mfd/index.html')); assert(frame);
  await page.evaluate(sample => { window.fixtureRaw = sample; window.fixtureFeed = setInterval(() => { window.fixtureRaw.TimestampMS += 16; window.dispatchEvent(new CustomEvent('telemetry', { detail: { ...window.fixtureRaw } })); }, 16); }, rawSample);
  await page.waitForTimeout(250); assert.equal(await frame.locator('#r34Single-value').textContent(), '1.20'); assert.equal(await frame.locator('#r34DigitalSpeed').textContent(), '162 km/h');
  await page.screenshot({ path: path.join(out, 'host-live.png'), omitBackground: true });
  for (const mode of ['multi', 'g', 'lap', 'twin', 'single']) {
    await page.evaluate(config => window.dispatchEvent(new CustomEvent('hud:config', { detail: config })), { ...baseConfig, r34MfdMode: mode });
    await page.waitForTimeout(100); assert.equal(await frame.locator('[data-mode]:not([hidden])').getAttribute('data-mode'), mode); report.checks.push('host mode ' + mode);
  }
  await page.evaluate(() => { delete window.fixtureRaw.Boost; }); await page.waitForTimeout(150); assert.equal(await frame.locator('#r34Single-value').textContent(), 'N/A');
  await page.evaluate(() => { window.fixtureRaw.Boost = 14.5038; }); await page.waitForTimeout(150);
  await page.evaluate(() => clearInterval(window.fixtureFeed)); await page.waitForTimeout(1800);
  assert.equal(await frame.locator('#r34Status').textContent(), 'STALE'); assert.equal(await frame.locator('#r34Single-value').textContent(), 'N/A');
  await page.screenshot({ path: path.join(out, 'host-stale-smoothing.png'), omitBackground: true }); report.checks.push('real Coordinator stale replay and missing raw Boost');
  await page.evaluate(config => window.dispatchEvent(new CustomEvent('hud:config', { detail: { ...config, hudStyle: 'simple' } })), baseConfig);
  await page.waitForTimeout(250); await page.evaluate(config => window.dispatchEvent(new CustomEvent('hud:config', { detail: config })), { ...baseConfig, r34MfdMode: 'lap', r34ShowCluster: false, r34Lighting: 'day' });
  await page.waitForFunction(() => document.querySelector('#hud-iframe')?.contentWindow?.R34Hud);
  frame = page.frames().find(f => f.url().includes('/r34_mfd/index.html'));
  assert.equal(await frame.locator('[data-mode]:not([hidden])').getAttribute('data-mode'), 'lap'); assert.equal(await frame.locator('#r34Cluster').isVisible(), false);
  report.checks.push('style switch-back keeps configuration and clears recording'); assert.deepEqual(report.errors, []);
} catch (error) { report.errors.push(String(error)); throw error; }
finally { await writeFile(path.join(out, 'launcher-evidence.json'), JSON.stringify(report, null, 2) + '\n'); await browser?.close(); server.close(); }
