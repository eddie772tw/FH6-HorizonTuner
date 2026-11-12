// Actual AppShell capture against an isolated Rust backend; no solver mocks.
// Requires the reviewed backend binary, frontend dependencies and Playwright core.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { chromium } = require(process.env.FH6_PLAYWRIGHT || 'D:/FH6-pr644-review/scratch/browser-tools/node_modules/playwright-core');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'docs/visual-review/pr-657');
const backendPort = Number(process.env.FH6_CAPTURE_BACKEND_PORT || 18757);
const vitePort = Number(process.env.FH6_CAPTURE_VITE_PORT || 1437);
const endpoint = `http://127.0.0.1:${backendPort}`;
const frontend = `http://127.0.0.1:${vitePort}`;
const scratch = path.join(root, 'scratch/pr657-capture-' + Date.now());
const dataDir = path.join(scratch, 'backend');
const children = [];
let finishing = false;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function sourceHashes() {
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', 'frontend/src', 'backend-rust/src', 'lang'], { cwd: root }).toString().trim().split(/\r?\n/);
  return Object.fromEntries([...new Set(files)].sort().filter(file => fs.existsSync(path.join(root, file))).map(file => [file, hash(path.join(root, file))]));
}
async function api(url, body) {
  const response = await fetch(endpoint + url, body === undefined ? {} : {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const value = await response.json();
  assert(response.ok, `${url}: ${response.status} ${JSON.stringify(value)}`);
  return value;
}
function launch(file, args, name, env = {}, cwd = root) {
  const log = fs.openSync(path.join(scratch, name + '.log'), 'w');
  const child = spawn(file, args, { cwd, windowsHide: true, env: { ...process.env, ...env }, stdio: ['pipe', log, log] });
  child.on('error', error => console.error(name, error));
  children.push(child);
  return child;
}
async function waitFor(url) {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await sleep(500);
  }
  throw new Error('Server did not become ready: ' + url);
}
async function revealBelowHeaders(page, selector) {
  await page.locator(selector).evaluate(element => {
    element.scrollIntoView({ block: 'start', behavior: 'instant' });
    const bottom = Math.max(0, ...[...document.querySelectorAll('.app-header, .companion-tabs, .companion-section-nav')]
      .filter(node => ['sticky', 'fixed'].includes(getComputedStyle(node).position))
      .map(node => node.getBoundingClientRect().bottom));
    let container = element.parentElement;
    while (container && !(container.scrollHeight > container.clientHeight && /(auto|scroll)/.test(getComputedStyle(container).overflowY))) container = container.parentElement;
    const delta = element.getBoundingClientRect().top - bottom - 16;
    if (container) container.scrollTop += delta;
    else window.scrollBy(0, delta);
  });
}
async function capturePanel(page, file) {
  const viewport = page.viewportSize();
  const height = await page.locator('#aego-model-panel').evaluate(element => element.getBoundingClientRect().height);
  const cropHeight = Math.max(viewport.height, Math.ceil(height) + 300);
  await page.setViewportSize({ width: viewport.width, height: cropHeight });
  await revealBelowHeaders(page, '#aego-model-panel');
  await page.locator('#aego-model-panel').screenshot({ path: path.join(output, file) });
  await page.setViewportSize(viewport);
  return { width: viewport.width, height: cropHeight };
}
const cores = ['default', 'modern', 'elegant', 'swiss', 'swiss-editorial', 'swiss-contrast', 'rhine-lab'];
const cases = cores.flatMap((core, index) => ['light', 'dark'].map((mode, m) => ({
  core, mode, width: 1280, goal: 'Drift',
  language: ['en-us', 'zh-tw', 'ja-jp'][(index + m) % 3], state: 'feasible',
})));
for (const core of ['default', 'swiss', 'rhine-lab']) for (const mode of ['light', 'dark']) {
  cases.push({ core, mode, width: 320, goal: 'Drift', language: mode === 'light' ? 'ja-jp' : 'zh-tw', state: 'feasible' });
}
for (const [goal, state] of [['Road', 'fwd'], ['Road', 'feasible'], ['Rally', 'cross-country'], ['Rally', 'feasible'], ['Drift', 'missing-target'], ['Drift', 'saturated'], ['Drag', 'infeasible-finish'], ['Drag', 'feasible'], ['Drag', 'engineering-prior']]) {
  cases.push({ core: 'default', mode: 'light', width: 1280, goal, language: 'en-us', state });
}
async function seed(c, index, samples, batch) {
  const profile = await api('/api/tuning/profile', {
    weight: 780, weight_distribution: 54, drivetrain: c.state === 'fwd' ? 'FWD' : 'AWD',
    induction: 'NA', maxHp: 75, maxTorque: 1, maxHpRpm: 3368, maxTorqueRpm: 2500,
    frontTireWidth: 225, frontTireAspect: 45, frontTireRim: 17,
    rearTireWidth: 245, rearTireAspect: 40, rearTireRim: 18, aeroEfficiency: 0.5,
    spring_front_min: 3, spring_front_max: 16, spring_rear_min: 3, spring_rear_max: 16,
    adjustability: { gears: 6, gearbox: 'Full', suspension: 'Race', arb: 'Adjustable', aero: 'Fixed', brakes: 'Adjustable', diff: 'Adjustable' },
    rallyProfile: c.state === 'cross-country' ? 'cross-country' : 'mixed-surface',
    driftWorkingTarget: c.state === 'missing-target' ? null : { mainGear: 3, targetRpm: 3000, wheelSpeedKmh: 80, source: 'user-target' },
    dragFinishSpeedKmh: c.goal === 'Drag' ? c.state === 'infeasible-finish' ? 40 : 250 : null,
    dragFinishSpeedProvenance: c.goal === 'Drag' ? 'manual' : null,
  });
  await api('/api/car_params/1435', profile);
  const id = 'pr657-review-' + index;
  const dependencyKey = JSON.stringify(['1435', profile.drivetrain, profile.induction, profile.maxHp, profile.maxTorque]);
  const observation = { schema: 'engine-observation/v1', id, carId: '1435', source: 'measured', capturedAt: 1000 + index, dependencyKey, data: batch.readySnapshot };
  const capture = { schemaVersion: 'tuning-capture/v1', metadata: { carId: '1435' }, samples, references: { engineObservationId: id, dependencyKey } };
  await api('/api/road/engine-observations', { observation, capture });
  return { id, profile };
}
async function captureCompanion(browser, c, qualified, batch, sampleCount, theme, t, stem) {
  const profile = await api('/api/car_params/1435');
  const snapshot = {
    carId: '1435', carName: '1966 Volkswagen Beetle', profile, profileKey: 'review-relay-projection',
    workflow: { goal: c.goal, season: 'Summer', step: 3 },
    results: { chassis: qualified.chassis, chassisDiagnostics: qualified.chassisDiagnostics, alignment: qualified.alignment,
      gearing: qualified.gearing, gearingDiagnostics: qualified.gearingDiagnostics, gearingView: qualified.gearingView },
    engine: { phase: 'complete', sampleCount, state: batch.readySnapshot }, readiness: qualified.readiness, calculationStatus: 'ready',
  };
  const { customCSS: _css, ...visual } = theme;
  const visualTheme = { schemaVersion: 1, ...visual };
  const page = await browser.newPage({ viewport: { width: c.width === 320 ? 320 : 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(visual => localStorage.setItem('companionVisualTheme/v1', JSON.stringify(visual)), visualTheme);
  const companionRoute = async route => {
    try {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/companion/workflow') {
      await route.fulfill({ json: { hostOnline: true, revision: 1, commands: [], snapshot, visualTheme }, headers: { 'access-control-allow-origin': '*' } });
      return;
    }
    const response = await route.fetch({ url: endpoint + url.pathname + url.search });
    await route.fulfill({ response, headers: { ...response.headers(), 'access-control-allow-origin': '*' } });
    } catch (error) {
      if (!finishing && !page.isClosed()) { errors.push(String(error)); await route.abort().catch(() => {}); }
    }
  };
  await page.route('http://127.0.0.1:8001/**', companionRoute);
  await page.route(frontend + '/api/**', companionRoute);
  await page.routeWebSocket('**/ws/**', () => {});
  await page.goto(frontend + '/companion/index.html');
  await page.getByRole('button', { name: t('Tuning'), exact: true }).click();
  await page.locator('#aego-model-panel').waitFor();
  assert.equal(await page.locator('#aego-model-panel').getAttribute('data-aego-status'), qualified.gearingDiagnostics.status);
  if (!qualified.readiness.gearingAvailable) assert.equal(await page.locator('#companion-gearing .companion-result-list').count(), 0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  assert(!overflow, stem + ': Companion document overflow');
  assert.equal(errors.length, 0, JSON.stringify(errors));
  await revealBelowHeaders(page, '#aego-model-panel');
  await page.evaluate(() => document.fonts.ready);
  const files = [stem + '-companion.png', stem + '-companion-panel.png'];
  await page.screenshot({ path: path.join(output, files[0]) });
  const panelViewport = await capturePanel(page, files[1]);
  await page.close();
  return { files, width: c.width === 320 ? 320 : 390, height: 844, panelViewport, overflow, errors, transport: 'Fixture relay projection of the actual Rust workflow response; no native host or device claim' };
}
async function captureCase(browser, c, index, samples, batch) {
  const { id } = await seed(c, index, samples, batch);
  const translations = JSON.parse(fs.readFileSync(path.join(root, 'lang', c.language + '.json'), 'utf8'));
  const t = key => translations[key] || key;
  const theme = { halfmoonCore: c.core, mode: c.mode, primaryColor: '#00f0ff', secondaryColor: '#ff003c', accentColor: '#7000ff', customCSS: '' };
  await api('/api/settings', { language: c.language, theme, developer_tuning_enabled: false, companion_enabled: false, companion_usb_enabled: false });
  const page = await browser.newPage({ viewport: { width: c.width, height: 720 }, deviceScaleFactor: 1, reducedMotion: index % 2 ? 'reduce' : 'no-preference' });
  const errors = [], failedApi = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(theme => {
    localStorage.setItem('themeSettings', JSON.stringify(theme));
    localStorage.setItem('fh6-data-out-guide/v1', 'skipped');
    localStorage.setItem('tuning-workflow-state', JSON.stringify({ schema: 'tuning-workflow/v3', step: 1 }));
  }, theme);
  // HTTP is forwarded to this script's own Rust process. Only live WS is silent.
  await page.route('http://127.0.0.1:8001/**', async route => {
    try {
    const incoming = new URL(route.request().url());
    if (incoming.pathname === '/api/companion/host') {
      // This view test does not impersonate the trusted native Companion host.
      await route.fulfill({ json: { commands: [] }, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' } });
      return;
    }
    const response = await route.fetch({ url: endpoint + incoming.pathname + incoming.search });
    if (!response.ok()) failedApi.push([incoming.pathname, response.status()]);
    await route.fulfill({ response, headers: { ...response.headers(), 'access-control-allow-origin': '*' } });
    } catch (error) {
      if (!finishing && !page.isClosed()) { failedApi.push(['transport', String(error)]); await route.abort().catch(() => {}); }
    }
  });
  await page.routeWebSocket('**/ws/**', () => {});
  await page.goto(frontend);
  await page.locator('.workspace-tabs--primary').getByRole('button', { name: t('Tune'), exact: true }).click();
  await page.locator('#tune-saved-vehicle').selectOption('1435');
  await page.locator('#tuning-draft-goal').selectOption(c.goal);
  if (c.goal !== 'Road') await page.getByRole('button', { name: t('Apply local baseline'), exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.tuning-workflow__steps button:nth-child(3)')?.disabled);
  if (c.goal === 'Drift' && c.state !== 'missing-target') {
    const field = page.locator('#aego-drift-wheel-speed');
    const target = c.state === 'saturated' ? '200' : '90';
    await field.click();
    await field.press('ControlOrMeta+A');
    await field.pressSequentially(target);
    await field.press('Tab');
    assert.equal(Number(await field.inputValue()), Number(target), 'The edited target must be committed before navigation');
  }
  if (c.goal === 'Drag' && c.state === 'engineering-prior') {
    const field = page.locator('#step1-drag-finish-speed');
    await field.click();
    await field.press('ControlOrMeta+A');
    await field.press('Backspace');
    await field.press('Tab');
    await page.getByRole('combobox', { name: t('Drag finish speed source'), exact: true }).selectOption('');
  }
  await page.evaluate(() => document.fonts.ready);
  const stem = `${c.core}-${c.mode}-${c.language}-${c.width}-${c.goal.toLowerCase()}-${c.state}`;
  const save = ['default', 'swiss', 'rhine-lab'].includes(c.core);
  const files = [];
  if (save) {
    const target = c.goal === 'Drift' ? '#aego-drift-target' : '#tuning-draft-goal';
    await revealBelowHeaders(page, target);
    const file = stem + '-setup.png';
    await page.screenshot({ path: path.join(output, file) }); files.push(file);
  }
  await page.locator('.tuning-workflow__steps button').nth(2).click();
  const history = page.locator('details').filter({ has: page.locator('summary', { hasText: t('Saved engine observations') }) }).first();
  await history.locator('summary').first().click();
  await history.locator('select').first().selectOption(id);
  await history.locator('input[type=checkbox]').first().check();
  const responsePromise = page.waitForResponse(response => {
    if (!response.url().includes('/api/tuning/workflow') || response.request().method() !== 'POST' || !response.ok()) return false;
    return response.request().postDataJSON()?.evidence?.observationId === id;
  });
  await history.getByRole('button', { name: t('Reuse the confirmed engine observation'), exact: true }).click();
  const qualified = await (await responsePromise).json();
  await page.waitForFunction(version => document.querySelector('#aego-model-panel')?.textContent.includes(version), qualified.gearingDiagnostics.modelVersion);
  if (qualified.readiness.gearingAvailable) await page.locator('.recharts-responsive-container').first().waitFor();
  await revealBelowHeaders(page, '#aego-model-panel');
  await page.evaluate(() => document.fonts.ready);
  const status = await page.locator('#aego-model-panel').getAttribute('data-aego-status');
  if (['missing-target', 'infeasible-finish'].includes(c.state)) assert.equal(status, 'unavailable', stem);
  else assert(['available', 'limited'].includes(status), `${stem}: ${status} ${JSON.stringify(qualified.gearingDiagnostics)}`);
  assert(qualified.evidenceProvenance, stem + ': no qualified Rust workflow response');
  assert.equal(qualified.readiness.gearingAvailable, !['missing-target', 'infeasible-finish'].includes(c.state));
  if (c.state === 'fwd') assert.equal(qualified.gearingView.drivenTireAxle, 'front');
  if (c.goal === 'Drag') {
    assert.equal(qualified.gearingDiagnostics.targetSource, c.state === 'engineering-prior' ? 'inherited-drag-engineering-prior' : 'caller-declared-manual');
    if (c.state === 'engineering-prior') {
      const saved = await api('/api/car_params/1435');
      assert.equal(saved.dragFinishSpeedKmh, null, 'Cleared finish speed must not survive navigation');
      assert.equal(saved.dragFinishSpeedProvenance, null, 'Cleared provenance must not survive navigation');
    }
  }
  if (c.goal === 'Drift' && c.state !== 'missing-target') assert.equal(qualified.gearingDiagnostics.targetWheelSpeedKmh, c.state === 'saturated' ? 200 : 90);
  if (c.state === 'saturated') assert.equal(status, 'limited');
  if (!qualified.readiness.gearingAvailable) {
    assert.equal(await page.locator('#aego-gearing-chart').count(), 0, 'An unavailable result must not invent a chart');
    assert(await page.locator('.tuning-workflow__steps button').nth(3).isDisabled(), 'An unavailable result must not open verification');
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  assert(!overflow, stem + ': document overflow');
  assert.equal(errors.length, 0, JSON.stringify(errors));
  assert.equal(failedApi.length, 0, JSON.stringify(failedApi));
  let panelViewport;
  if (save) {
    const file = stem + '-result.png';
    await page.screenshot({ path: path.join(output, file) }); files.push(file);
    const panel = stem + '-panel.png';
    panelViewport = await capturePanel(page, panel); files.push(panel);
    if (c.state === 'fwd') {
      await page.locator('.core-theme-chart').first().scrollIntoViewIfNeeded();
      const chart = stem + '-chart.png';
      await page.screenshot({ path: path.join(output, chart) }); files.push(chart);
    }
  }
  let companion;
  if ((save && c.width === 1280 && c.goal === 'Drift' && c.state === 'feasible')
      || ['missing-target', 'infeasible-finish', 'saturated'].includes(c.state)
      || (c.core === 'default' && c.width === 320 && c.mode === 'light')) {
    companion = await captureCompanion(browser, c, qualified, batch, samples.length, theme, t, stem);
    files.push(...companion.files);
  }
  await page.close();
  console.log(stem + ': ' + status);
  return { ...c, status, overflow, errors, failedApi, files, panelViewport, companion, modelVersion: qualified.gearingDiagnostics?.modelVersion, drivenTireAxle: qualified.gearingView?.drivenTireAxle };
}
(async () => {
  fs.mkdirSync(output, { recursive: true }); fs.mkdirSync(dataDir, { recursive: true });
  const binary = process.env.FH6_CAPTURE_BACKEND || path.join(root, 'backend-rust/target/debug/server-sidecar.exe');
  assert(fs.existsSync(binary), 'Build the reviewed backend first, or set FH6_CAPTURE_BACKEND');
  const capturedBinary = path.join(scratch, 'fh6-backend.exe');
  fs.copyFileSync(binary, capturedBinary);
  const baseCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim();
  launch(capturedBinary, ['--data-dir', dataDir, '--port', String(backendPort)], 'backend', { TELEMETRY_PORT: String(backendPort + 1) });
  launch(process.execPath, [path.join(root, 'frontend/node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort'], 'vite', { VITE_GIT_COMMIT: '', RELEASE_TAG: '' }, path.join(root, 'frontend'));
  await Promise.all([waitFor(endpoint + '/api/runtime'), waitFor(frontend)]);
  const fixture = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/aego_beetle_engine_captures.json'), 'utf8'));
  const samples = fixture.captures[0].samples.map(row => Object.fromEntries(fixture.fields.map((key, i) => [key, row[i]])));
  const batch = await api('/api/tuning/engine-batch', { schemaVersion: 'engine-batch/v1', carId: '1435', state: null, samples, nowMs: 30000, connected: true });
  assert(batch.readySnapshot, 'Checked-in capture must qualify in Rust');
  const browser = await chromium.launch({ executablePath: process.env.FH6_CHROMIUM || 'C:/Users/eddie/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe', headless: true });
  try {
    const sources = sourceHashes();
    const results = [];
    const selected = process.env.FH6_CAPTURE_CASE ? cases.filter(c => JSON.stringify(c).includes(process.env.FH6_CAPTURE_CASE)) : cases;
    for (let i = 0; i < selected.length; i++) results.push(await captureCase(browser, selected[i], i, samples, batch));
    const files = results.flatMap(result => result.files).map(file => ({ file, sha256: hash(path.join(output, file)) }));
    assert.deepEqual(sourceHashes(), sources, 'Product sources changed during capture; recapture the final implementation');
    fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({
      date: new Date().toISOString(), baseCommit,
      browser: browser.version(), backendSha256: hash(capturedBinary), sourceHashes: sources, fixtureSha256: hash(path.join(root, 'tests/fixtures/aego_beetle_engine_captures.json')),
      environment: 'Windows Chromium headless, real AppShell/providers, isolated Rust HTTP and data directory; checked-in historical capture replay with synthetic static profiles. Live WebSocket is silent and the native-only Companion host exchange is a neutral empty-commands fixture; all tuning calculations and storage use Rust. Companion App/providers use a fixture relay projection of those actual Rust workflow responses, without native pairing. DPR1, 100% zoom. Viewport screenshots scrolled to affected setup/result/chart, with separately labelled model-panel crops. Not game A/B, native device, Companion host, drift ground-speed or performance acceptance.',
      cases: results, images: files,
    }, null, 2) + '\n');
  } finally { finishing = true; await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  for (const child of children.reverse()) { child.stdin?.end(); if (child.exitCode === null) child.kill(); }
});
