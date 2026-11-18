import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const { chromium } = await import(process.env.FH6_PLAYWRIGHT_MODULE || '/opt/codex/cua_node/lib/node_modules/playwright-core/index.mjs');
const repo = fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, '');
const out = fileURLToPath(new URL('./', import.meta.url));
const dicts = Object.fromEntries(await Promise.all(['en-us', 'zh-tw', 'ja-jp'].map(async code => [code, JSON.parse(await fs.readFile(`${repo}/lang/${code}.json`, 'utf8'))])));
const settings = await (await fetch('http://127.0.0.1:8001/api/settings')).json();
const browser = await chromium.launch({ executablePath: process.env.FH6_CHROMIUM || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const results = [];
try {
  for (const [core, mode, language, width] of [
    ['default', 'light', 'en-us', 1280], ['default', 'dark', 'zh-tw', 1280],
    ['swiss', 'light', 'zh-tw', 1280], ['swiss', 'dark', 'ja-jp', 1280],
    ['rhine-lab', 'light', 'ja-jp', 1280], ['rhine-lab', 'dark', 'en-us', 1280],
    ['default', 'dark', 'zh-tw', 320], ['rhine-lab', 'light', 'en-us', 320],
  ]) {
    const theme = { halfmoonCore: core, mode, primaryColor: '#00f0ff', secondaryColor: '#ff003c', accentColor: '#7000ff', customCSS: '' };
    const context = await browser.newContext({ viewport: { width, height: width === 320 ? 800 : 720 }, reducedMotion: 'reduce' });
    await context.addInitScript(theme => {
      localStorage.setItem('themeSettings', JSON.stringify(theme));
      localStorage.setItem('fh6-data-out-guide/v1', 'skipped');
      localStorage.setItem('tuning-workflow-state', JSON.stringify({ schema: 'tuning-workflow/v3', step: 1 }));
    }, theme);
    await context.route('**/api/settings', route => route.fulfill({ json: { ...settings, language, theme, auto_check_updates: false } }));
    await context.route('**/api/languages**', route => {
      const code = new URL(route.request().url()).pathname.split('/').pop();
      return route.fulfill({ json: dicts[code] ?? Object.keys(dicts).map(code => ({ code, name: code })) });
    });
    let clock = 60000;
    let failSave = false;
    let holdCalculation = false;
    let releaseCalculation;
    let calculationHeld;
    const held = new Promise(resolve => { calculationHeld = resolve; });
    await context.route('**/api/car_params/42', route => {
      if (failSave && route.request().method() === 'POST') return route.fulfill({ status: 500, json: { error: 'Review fixture: save failed' } });
      return route.continue();
    });
    await context.route('**/api/tuning/workflow', async route => {
      const input = route.request().postDataJSON();
      if (holdCalculation && input.inputSnapshot?.baselineCurrent == null) {
        calculationHeld();
        await new Promise(resolve => { releaseCalculation = resolve; });
      }
      await route.continue();
    });
    await context.routeWebSocket('**/ws/telemetry', socket => {
      const send = () => socket.send(JSON.stringify({ TelemetrySchema: 'forza-data-out/v2', CarOrdinal: 42, CarPerformanceIndex: 700, CarClass: 3,
        TimestampMS: clock += 100, IsRaceOn: 0, EngineMaxRpm: 8000, EngineIdleRpm: 1000, CurrentEngineRpm: 1000,
        Gear: 2, PowerWatts: 0, TorqueNewtons: 0, SpeedMetersPerSecond: 0, AccelInput: 0, BrakeInput: 0, ClutchInput: 0, HandBrakeInput: 0,
        NormalizedSuspensionTravel: [0, 0, 0, 0], TireSlipRatio: [0, 0, 0, 0], TireSlipAngle: [0, 0, 0, 0], TireTemp: [70, 70, 70, 70],
      }));
      send(); const interval = setInterval(send, 100); socket.onClose(() => clearInterval(interval));
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const t = key => dicts[language][key] ?? key;
    await page.goto(process.env.FH6_REVIEW_URL || 'http://127.0.0.1:1453/');
    await page.getByRole('button', { name: t('Tune'), exact: true }).click();
    await page.locator('#tuning-draft-goal').selectOption('Rally');
    await page.getByRole('button', { name: t('Apply local baseline'), exact: true }).waitFor();
    const next = page.getByRole('button', { name: t('Go to chassis & tires'), exact: true });
    if (await next.isDisabled()) throw Error('Draft disabled forward navigation');
    await page.locator('.tuning-workflow').evaluate(element => { element.scrollTop = 0; });
    const prefix = `${core}-${mode}-${language}-${width}`;
    await page.screenshot({ path: `${out}/${prefix}-draft.png` });
    if (core === 'default' && mode === 'light' && language === 'en-us') {
      const weight = page.locator('#step1-weight');
      await weight.fill(String(Number(await weight.inputValue()) + 1));
      failSave = true;
      await next.click();
      await page.getByText(t('Vehicle parameters could not be saved. Your edits are retained. Retry Save vehicle parameters or navigation.'), { exact: false }).waitFor();
      await page.locator('.tuning-workflow').evaluate(element => { element.scrollTop = 0; });
      await page.screenshot({ path: `${out}/${prefix}-save-error.png` });
      failSave = false;
      holdCalculation = true;
      await next.click();
      await held;
      await page.screenshot({ path: `${out}/${prefix}-preparing.png` });
      holdCalculation = false;
      releaseCalculation();
    } else await next.click();
    await page.getByRole('button', { name: t('Go to engine data & gearing'), exact: true }).waitFor();
    if (!(await page.locator('#tuning-target-status').textContent()).includes(t('Rally'))) throw Error('Draft target was not applied');
    await page.getByRole('button', { name: t('Go to engine data & gearing'), exact: true }).click();
    await page.getByRole('heading', { name: t('Prepare engine data for gearing'), exact: true }).waitFor();
    await page.getByText(`${t('Engine limit received')}: 8000 RPM`, { exact: false }).waitFor();
    const engineResponse = predicate => page.waitForResponse(async response => response.url().endsWith('/api/tuning/engine-batch')
      && response.ok() && predicate(await response.json()));
    const resetClock = async () => {
      const response = engineResponse(value => value.continuity?.restartCount > 0);
      clock = -100;
      await response;
    };
    await resetClock();
    await engineResponse(value => value.state?.lastTimestampMs >= 100 && value.state?.status !== 'blocked');
    await resetClock();
    const recovered = page.getByText(t('The driving session restarted. Collection restarted automatically; unfinished progress was cleared.'), { exact: true });
    await recovered.waitFor();
    await recovered.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/${prefix}-recovery.png` });
    const bounds = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    if (errors.length) throw Error(errors.join('\n'));
    results.push({ core, mode, language, width, recoveries: 2, bounds, errors });
    console.log(JSON.stringify(results[results.length - 1]));
    await context.close();
  }
  await fs.writeFile(`${out}/browser-results.json`, JSON.stringify(results, null, 2) + '\n');
  const sources = {};
  async function hashSources(directory) {
    for (const entry of await fs.readdir(`${repo}/${directory}`, { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) await hashSources(path);
      else sources[path] = createHash('sha256').update(await fs.readFile(`${repo}/${path}`)).digest('hex');
    }
  }
  await hashSources('frontend/src');
  for (const path of ['backend-rust/src/tuning/measurement.rs', 'lang/en-us.json', 'lang/zh-tw.json', 'lang/ja-jp.json']) {
    sources[path] = createHash('sha256').update(await fs.readFile(`${repo}/${path}`)).digest('hex');
  }
  await fs.writeFile(`${out}/source-manifest.json`, JSON.stringify({ capturedAt: new Date().toISOString(),
    baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
    state: 'base plus uncommitted tuning navigation and recovery implementation', sources }, null, 2) + '\n');
} finally { await browser.close(); }
