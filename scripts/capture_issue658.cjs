// Real AppShell/providers and isolated Rust storage. No solver or archive-response mocks.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { spawn, execFileSync } = require('node:child_process');
const { chromium } = require(process.env.FH6_PLAYWRIGHT || 'D:/FH6-pr644-review/scratch/browser-tools/node_modules/playwright-core');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'docs/visual-review/issue-658');
const scratch = path.join(root, 'scratch/issue658-capture-' + Date.now());
const dataDir = path.join(scratch, 'backend');
const backendPort = Number(process.env.FH6_CAPTURE_BACKEND_PORT || 18767);
const vitePort = Number(process.env.FH6_CAPTURE_VITE_PORT || 1447);
const endpoint = `http://127.0.0.1:${backendPort}`;
const frontend = `http://127.0.0.1:${vitePort}`;
const children = [];
let finishing = false;
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function sourceHashes() {
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', 'frontend/src', 'backend-rust/src', 'backend-rust/resources/defaults.json', 'lang'], { cwd: root }).toString().trim().split(/\r?\n/);
  return Object.fromEntries([...new Set(files)].sort().filter(file => fs.existsSync(path.join(root, file))).map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')).digest('hex')]));
}
async function api(url, body) {
  const response = await fetch(endpoint + url, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const value = await response.json();
  assert(response.ok, `${url}: ${response.status} ${JSON.stringify(value)}`);
  return value;
}
function launch(file, args, name, env = {}, cwd = root) {
  const log = fs.openSync(path.join(scratch, name + '.log'), 'w');
  const child = spawn(file, args, { cwd, windowsHide: true, env: { ...process.env, ...env }, stdio: ['pipe', log, log] });
  child.on('error', error => console.error(name, error)); children.push(child); return child;
}
async function waitFor(url) {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(url)).ok) return; } catch {} await sleep(500); }
  throw new Error('Server did not become ready: ' + url);
}
async function reveal(page, selector) {
  await (typeof selector === 'string' ? page.locator(selector) : selector).evaluate(element => {
    element.scrollIntoView({ block: 'start', behavior: 'instant' });
    const bottom = Math.max(0, ...[...document.querySelectorAll('.app-header')].filter(node => ['sticky', 'fixed'].includes(getComputedStyle(node).position)).map(node => node.getBoundingClientRect().bottom));
    let container = element.parentElement;
    while (container && !(container.scrollHeight > container.clientHeight && /(auto|scroll)/.test(getComputedStyle(container).overflowY))) container = container.parentElement;
    const delta = element.getBoundingClientRect().top - bottom - 16;
    if (container) container.scrollTop += delta; else window.scrollBy(0, delta);
  });
}
const cores = ['default', 'modern', 'elegant', 'swiss', 'swiss-editorial', 'swiss-contrast', 'rhine-lab'];
const cases = cores.flatMap((core, i) => ['light', 'dark'].map((mode, m) => ({ core, mode, width: 1280, language: ['en-us', 'zh-tw', 'ja-jp'][(i + m) % 3], state: 'records' })));
for (const core of ['default', 'swiss', 'rhine-lab']) for (const mode of ['light', 'dark']) cases.push({ core, mode, width: 320, language: mode === 'light' ? 'ja-jp' : 'zh-tw', state: 'records' });
const fixtures = [
  { id: 'archive-rally', workflowId: 'compatibility', kind: 'compatibility', schema: 'road-workflow/v1', createdAt: 1730000000, discipline: 'Rally', recommendation: { formulaVersion: 'rust/ice-measured-workflow-v3', inputSnapshot: { carId: '1435', goal: 'Rally', gearingModelVersion: 'aego-rally/v1' }, fields: { 'gearing.finalDrive': { value: 3.52, unit: 'ratio' } } }, source: 'Static visual fixture; historical values, not game validation' },
  { id: 'archive-road', workflowId: 'archive-road', kind: 'workflow', schema: 'road-workflow/v1', createdAt: 1730000001, recommendation: { formulaVersion: 'rust/ice-measured-workflow-v2', inputSnapshot: { carId: '1435', goal: 'Road', gearingModelVersion: 'aego-road-joint/v2' }, fields: { 'gearing.finalDrive': { value: 3.88, unit: 'ratio' } } }, source: 'Static visual fixture; historical values, not game validation' },
  { id: 'archive-setup', workflowId: 'archive-road', kind: 'setup', schema: 'road-workflow/v1', createdAt: 1730000002, fields: { 'gearing.finalDrive': 3.88 } },
  { id: 'archive-run', workflowId: 'archive-road', kind: 'run', schema: 'road-workflow/v1', createdAt: 1730000003, sessionId: 'archive-session', setupId: 'archive-setup' },
];
fixtures[1].identity = { ordinal: 1435, performanceIndex: 400, carClass: 0 };
const recording = { source: 'synthetic-sqlite-fixture', endReason: 'manual-stop' };
const points = [3000, 3200].map((rpm, index) => ({ TimestampMS: 1000 + index * 100, IsRaceOn: 1, CarOrdinal: 1435, CurrentEngineRpm: rpm, SpeedMetersPerSecond: 20 + index, Gear: 3 }));
async function captureCase(browser, c) {
  const translations = JSON.parse(fs.readFileSync(path.join(root, 'lang', c.language + '.json'), 'utf8'));
  const t = key => translations[key] || key;
  const theme = { halfmoonCore: c.core, mode: c.mode, primaryColor: '#00f0ff', secondaryColor: '#ff003c', accentColor: '#7000ff', customCSS: '' };
  await api('/api/settings', { language: c.language, theme, developer_tuning_enabled: true, companion_enabled: false, companion_usb_enabled: false });
  const page = await browser.newPage({ viewport: { width: c.width, height: 720 }, deviceScaleFactor: 1, reducedMotion: 'reduce', acceptDownloads: true });
  const errors = [], failedApi = [];
  let simulateArchiveError = c.state === 'error';
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(theme => {
    // Exercise the real browser-download capability path, without a native picker.
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true });
    localStorage.setItem('themeSettings', JSON.stringify(theme));
    localStorage.setItem('fh6-data-out-guide/v1', 'skipped');
    localStorage.setItem('tuning-workflow-state', JSON.stringify({ schema: 'tuning-workflow/v3', step: 1 }));
  }, theme);
  await page.route('http://127.0.0.1:8001/**', async route => {
    try {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/companion/host') { await route.fulfill({ json: { commands: [] }, headers: { 'access-control-allow-origin': '*' } }); return; }
      if (url.pathname === '/api/road/archives' && simulateArchiveError) { await route.fulfill({ status: 503, json: { error: 'Deliberate visual failure fixture' }, headers: { 'access-control-allow-origin': '*' } }); return; }
      const response = await route.fetch({ url: endpoint + url.pathname + url.search });
      if (!response.ok()) failedApi.push([url.pathname, response.status()]);
      await route.fulfill({ response, headers: { ...response.headers(), 'access-control-allow-origin': '*' } });
    } catch (error) { if (!finishing && !page.isClosed()) { failedApi.push(['transport', String(error)]); await route.abort().catch(() => {}); } }
  });
  await page.routeWebSocket('**/ws/**', () => {});
  await page.goto(frontend);
  await page.locator('.workspace-tabs--primary').getByRole('button', { name: t('Tune'), exact: true }).click();
  await page.locator('#tune-saved-vehicle').selectOption('1435');
  await page.waitForFunction(() => !document.querySelector('.tuning-workflow__steps button:nth-child(3)')?.disabled);
  const archive = page.locator('#retired-recommendation-archive');
  await archive.locator('summary').first().click();
  if (c.state === 'empty') await archive.getByText(t('No retired recommendations are stored.'), { exact: true }).waitFor();
  else if (c.state === 'error') await archive.getByText(t('Archived recommendations could not be loaded. Close and reopen this panel to retry.'), { exact: true }).waitFor();
  else {
    await archive.getByText(t('Retired · read-only · not validated'), { exact: true }).first().waitFor({ state: 'attached' });
    assert.equal(await archive.locator('details').count(), 2);
    for (const detail of await archive.locator('details').all()) await detail.locator('summary').click();
  }
  const stem = `${c.core}-${c.mode}-${c.language}-${c.width}-${c.state}`;
  const files = [], exports = [];
  let archivePanelViewport;
  const save = ['default', 'swiss', 'rhine-lab'].includes(c.core);
  if (save) { await reveal(page, '#retired-recommendation-archive'); await page.evaluate(() => document.fonts.ready); const file = stem + '-archive.png'; await page.screenshot({ path: path.join(output, file) }); files.push(file);
    if (c.state === 'records') {
      const height = Math.max(720, Math.ceil(await archive.evaluate(element => element.getBoundingClientRect().height)) + 400);
      archivePanelViewport = { width: c.width, height };
      await page.setViewportSize(archivePanelViewport); await reveal(page, '#retired-recommendation-archive');
      const panel = stem + '-archive-panel.png'; await archive.screenshot({ path: path.join(output, panel) }); files.push(panel);
      await page.setViewportSize({ width: c.width, height: 720 });
    }
  }
  if (c.state === 'records' && c.core === 'default' && c.mode === 'light' && c.width === 1280) {
    for (const [label, expected] of [['Export original record', fixtures[0]], ['Export original history', fixtures.filter(doc => doc.workflowId === 'archive-road')]]) {
      const downloadPromise = page.waitForEvent('download');
      await archive.getByRole('button', { name: t(label), exact: true }).click();
      const download = await downloadPromise; const file = path.join(scratch, download.suggestedFilename()); await download.saveAs(file);
      assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), expected);
      exports.push({ filename: download.suggestedFilename(), sha256: hash(file), originalJsonEqual: true });
    }
    const downloadPromise = page.waitForEvent('download');
    await archive.getByRole('button', { name: `${t('Export recorded frames')}: archive-run`, exact: true }).click();
    const download = await downloadPromise, file = path.join(scratch, download.suggestedFilename());
    await download.saveAs(file);
    const capture = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(capture.schemaVersion, 'tuning-capture/v1');
    assert.equal(capture.metadata.carId, '1435');
    assert.equal(capture.references.workflowId, 'archive-road');
    assert.equal(capture.references.runId, 'archive-run');
    assert.equal(capture.references.setupId, 'archive-setup');
    assert.deepEqual(capture.recording, recording);
    assert.deepEqual(capture.samples.map(({ timestampMS, rpm, speedMps, gear }) => ({ timestampMS, rpm, speedMps, gear })), [
      { timestampMS: 1000, rpm: 3000, speedMps: 20, gear: 3 },
      { timestampMS: 1100, rpm: 3200, speedMps: 21, gear: 3 },
    ]);
    exports.push({ filename: download.suggestedFilename(), sha256: hash(file), sampleCount: capture.samples.length, savedSessionCaptureVerified: true });
  }
  if (c.state === 'error') {
    simulateArchiveError = false;
    await archive.locator('summary').first().click(); await archive.locator('summary').first().click();
    await archive.getByText(t('No retired recommendations are stored.'), { exact: true }).waitFor();
  }
  if (c.state === 'records') {
    await archive.locator('summary').first().click();
    await page.getByRole('button', { name: t('App Menu'), exact: true }).click();
    await page.getByRole('menuitem', { name: t('Settings'), exact: true }).click();
    const dialog = page.locator('.app-dialog--settings'); await dialog.waitFor();
    assert.equal(await page.locator('#chk-developer-tuning').count(), 0);
    assert.equal(await dialog.locator('.settings-section').count(), 5);
    if (save) { const file = stem + '-settings.png'; await page.screenshot({ path: path.join(output, file) }); files.push(file); }
    await dialog.getByRole('button', { name: t('Close'), exact: true }).click(); await dialog.waitFor({ state: 'detached' });
    await page.locator('.tuning-workflow__steps button').nth(2).click();
    await page.getByRole('button', { name: t('Open telemetry capture'), exact: true }).click();
    await page.getByRole('heading', { name: t('Tuning Telemetry Capture'), exact: true }).waitFor();
    await reveal(page, page.getByRole('heading', { name: t('Tuning Telemetry Capture'), exact: true }));
    if (save) { const file = stem + '-capture.png'; await page.screenshot({ path: path.join(output, file) }); files.push(file); }
    await page.getByRole('button', { name: t('Back to engine data'), exact: true }).last().click();
    await page.getByRole('button', { name: t('Open telemetry capture'), exact: true }).waitFor();
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  assert(!overflow, stem + ': document overflow'); assert.deepEqual(errors, []); assert.deepEqual(failedApi, []);
  await page.close(); console.log(stem + ': passed'); return { ...c, viewport: { width: c.width, height: 720 }, files, exports, archivePanelViewport, overflow, errors, failedApi };
}
(async () => {
  fs.mkdirSync(output, { recursive: true }); fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'settings.json'), JSON.stringify({ settings_schema_version: 2, developer_tuning_enabled: true }));
  const binary = process.env.FH6_CAPTURE_BACKEND || path.join(root, 'backend-rust/target/debug/server-sidecar.exe');
  const capturedBinary = path.join(scratch, 'fh6-backend.exe'); fs.copyFileSync(binary, capturedBinary);
  launch(capturedBinary, ['--data-dir', dataDir, '--port', String(backendPort)], 'backend', { TELEMETRY_PORT: String(backendPort + 1) });
  launch(process.execPath, [path.join(root, 'frontend/node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort'], 'vite', { VITE_GIT_COMMIT: '', RELEASE_TAG: '' }, path.join(root, 'frontend'));
  await Promise.all([waitFor(endpoint + '/api/runtime'), waitFor(frontend)]);
  const profile = await api('/api/tuning/profile', { weight: 780, weight_distribution: 54, drivetrain: 'AWD', induction: 'NA', maxHp: 75, maxTorque: 1, maxHpRpm: 3368, maxTorqueRpm: 2500, frontTireWidth: 225, frontTireAspect: 45, frontTireRim: 17, rearTireWidth: 245, rearTireAspect: 40, rearTireRim: 18, spring_front_min: 3, spring_front_max: 16, spring_rear_min: 3, spring_rear_max: 16, adjustability: { gears: 6, gearbox: 'Full', suspension: 'Race', arb: 'Adjustable', aero: 'Fixed', brakes: 'Adjustable', diff: 'Adjustable' } });
  await api('/api/car_params/1435', profile);
  const browser = await chromium.launch({ executablePath: process.env.FH6_CHROMIUM || 'C:/Users/eddie/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe', headless: true });
  try {
    const sources = sourceHashes(), results = [];
    for (const state of ['empty', 'error']) results.push(await captureCase(browser, { core: 'default', mode: 'light', language: 'en-us', width: 1280, state }));
    const db = new DatabaseSync(path.join(dataDir, 'telemetry_sessions.db'));
    const insert = db.prepare('INSERT INTO road_documents VALUES (?, ?, ?, ?, ?)');
    for (const doc of fixtures) insert.run(doc.id, doc.workflowId, doc.kind, doc.createdAt, JSON.stringify(doc));
    db.prepare('INSERT INTO sessions(session_id,car_ordinal,car_name,start_time,metadata_json) VALUES (?,?,?,?,?)').run('archive-session', 1435, 'Synthetic Beetle', 1730000001, JSON.stringify(recording));
    const insertPoint = db.prepare('INSERT INTO telemetry_channels(session_id,lap_number,relative_time,raw_json) VALUES (?,?,?,?)');
    points.forEach((point, index) => insertPoint.run('archive-session', 0, index / 10, JSON.stringify(point)));
    db.close();
    const liveRetirement = [];
    for (const [url, body, status] of [
      ['/api/road/compatibility', { recommendation: fixtures[0].recommendation }, 410],
      ['/api/road/workflows/archive-road/runs', {}, 410],
      ['/api/tuning/developer', {}, 404],
    ]) {
      const response = await fetch(endpoint + url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      assert.equal(response.status, status, url);
      liveRetirement.push({ path: url, status: response.status });
    }
    for (const c of cases) results.push(await captureCase(browser, c));
    assert.deepEqual(sourceHashes(), sources, 'Product sources changed during capture');
    const files = results.flatMap(result => result.files).map(file => ({ file, sha256: hash(path.join(output, file)) }));
    fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({ date: new Date().toISOString(), baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim(), workingTree: 'Review base plus verified review fixes; source hashes below identify capture sources', browser: browser.version(), backendSha256: hash(capturedBinary), sourceHashes: sources, sourceHashNormalization: 'UTF-8 source text with CRLF normalized to LF; image and backend binary hashes are raw bytes', fixtureRecords: fixtures, liveRetirement, environment: 'Windows Chromium headless, real AppShell/providers, isolated Rust HTTP/storage. Static historical JSON fixtures inserted only into disposable SQLite. Downloads compared against original documents and complete workflow document history; separate run capture downloaded from actual sessions/telemetry_channels fixture and verified sample-by-sample. Saved obsolete developer flag is true; normal workflow remains accessible. Silent WebSocket; native-only Companion host exchange uses empty commands. Only archive-error case deliberately injects HTTP503, then retries actual Rust successfully. Browser save picker disabled as a capability fixture to exercise real browser downloads. DPR1, reduced motion, 1280x720 and 320x720, Archive panel crops use the explicitly recorded taller viewport while retaining actual AppShell styles; normal viewport images also supplied. No style overrides or image edits. Not game, real device, native file dialog, Narrator/NVDA or performance acceptance.', cases: results, images: files }, null, 2) + '\n');
  } finally { finishing = true; await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { for (const child of children.reverse()) { child.stdin?.end(); if (child.exitCode === null) child.kill(); } });
