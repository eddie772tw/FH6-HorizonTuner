// Actual AppShell/providers with isolated Rust HTTP; native controller results
// are explicit presentation fixtures. This does not start or change the game.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const { chromium } = require(process.env.FH6_PLAYWRIGHT || path.join(root, 'scratch/browser-tools/node_modules/playwright-core'));
const output = path.join(root, 'docs/visual-review/auto-tune');
const scratch = path.join(root, 'scratch/auto-tune-visual-' + Date.now());
const endpoint = 'http://127.0.0.1:18764';
const frontend = 'http://127.0.0.1:1438';
const children = [];
const hash = p => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
async function wait(url) {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(url)).ok) return; } catch {} await new Promise(r => setTimeout(r, 500)); }
  throw Error('Not ready: ' + url);
}
function launch(file, args, name, cwd = root) {
  const log = fs.openSync(path.join(scratch, name + '.log'), 'w');
  const child = spawn(file, args, { cwd, windowsHide: true, stdio: ['pipe', log, log], env: { ...process.env, TELEMETRY_PORT: '18765' } });
  children.push(child); return child;
}
const snapshot = {
  status: 'completed', step: 3, elapsedMs: 206562, active: false, goal: 'Road', season: 'Winter',
  runId: 'presentation-fixture', imageRevision: null,
  observed: { carName: '1964 Aston Martin DB5', carClass: 'B', performanceIndex: 600, weight: 1224.7, maxHp: 316, 'pressure.front': { value: 33, unit: 'psi' }, 'pressure.rear': { value: 33, unit: 'psi' } },
  recommended: { 'pressure.front': '28 psi', 'pressure.rear': '28 psi', 'camber.front': '-2.1 deg', 'camber.rear': '-1.3 deg', 'gearing.finalDrive': '3.99 ratio' },
  logs: [{ elapsedMs: 0, message: 'Step 1' }, { elapsedMs: 30000, message: 'Step 2' }, { elapsedMs: 120000, message: 'Step 3' }, { elapsedMs: 206562, message: 'Completed' }],
};
const gameFrame = process.env.FH6_REVIEW_GAME_FRAME;
const image = gameFrame ? [...fs.readFileSync(gameFrame)] : null;
if (image) snapshot.imageRevision = 'archived-game-frame';
(async () => {
  fs.mkdirSync(output, { recursive: true }); fs.mkdirSync(scratch, { recursive: true });
  const backend = path.join(root, 'backend-rust/target/release/server-sidecar.exe');
  launch(backend, ['--data-dir', path.join(scratch, 'data'), '--port', '18764'], 'backend');
  launch(process.execPath, [path.join(root, 'frontend/node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '1438', '--strictPort'], 'vite', path.join(root, 'frontend'));
  await Promise.all([wait(endpoint + '/api/runtime'), wait(frontend)]);
  const browser = await chromium.launch({ executablePath: process.env.FH6_CHROMIUM || 'C:/Users/eddie/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe', headless: true });
  const results = [];
  const cases = ['default', 'modern', 'elegant', 'swiss', 'swiss-editorial', 'swiss-contrast', 'rhine-lab'].flatMap((core, i) => ['light', 'dark'].map((mode, m) => ({ core, mode, language: ['zh-tw', 'en-us', 'ja-jp'][(i + m) % 3], width: 1280, state: 'completed' })));
  for (const core of ['default', 'swiss', 'rhine-lab']) cases.push({ core, mode: 'light', language: 'zh-tw', width: 320, state: 'failed' });
  cases.push({ core: 'default', mode: 'dark', language: 'zh-tw', width: 1280, state: 'empty' });
  for (const state of ['running', 'stopped']) cases.push({ core: 'swiss', mode: 'light', language: 'en-us', width: 1280, state });
  try {
    for (const c of cases) {
      const theme = { halfmoonCore: c.core, mode: c.mode, primaryColor: '#00f0ff', secondaryColor: '#ff003c', accentColor: '#7000ff', customCSS: '' };
      await fetch(endpoint + '/api/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ language: c.language, theme, companion_enabled: false }) });
      const t = JSON.parse(fs.readFileSync(path.join(root, 'lang', c.language + '.json'), 'utf8'));
      const tr = key => t[key] || key;
      const page = await browser.newPage({ viewport: { width: c.width, height: 720 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(({ theme, state, snapshot, image }) => {
        localStorage.setItem('themeSettings', JSON.stringify(theme));
        localStorage.setItem('fh6-data-out-guide/v1', 'skipped');
        let enabled = state !== 'empty';
        window.__TAURI_INTERNALS__ = {
          metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
          transformCallback: () => 1, unregisterCallback() {},
          async invoke(command, args) {
            if (command === 'auto_tune_enabled') return enabled;
            if (command === 'set_auto_tune_enabled') { enabled = args.value; return; }
            if (command === 'auto_tune_poll') return state === 'empty' ? null : { ...snapshot, status: state, active: state === 'running' };
            if (command === 'auto_tune_image') return Uint8Array.from(image).buffer;
            if (command === 'plugin:app|version') return '11.45.27';
            return null;
          },
        };
      }, { theme, state: c.state, snapshot, image });
      let developerEnabled = c.state !== 'empty';
      await page.route('http://127.0.0.1:8001/**', async route => {
        const url = new URL(route.request().url());
        const headers = { 'access-control-allow-origin': '*' };
        if (url.pathname === '/api/auto-tune/status') return route.fulfill({ json: { developerOptions: developerEnabled, available: true, experimental: true, run: c.state === 'empty' ? null : { ...snapshot, status: c.state, active: c.state === 'running', logs: c.state === 'completed' ? snapshot.logs : [...snapshot.logs.slice(0, 3), { elapsedMs: 206562, message: c.state === 'failed' ? '量測資料不足，已停止操作' : c.state === 'stopped' ? 'Stopped' : 'Running' }] } }, headers });
        if (url.pathname === '/api/auto-tune/enabled') { developerEnabled = route.request().postDataJSON().value; return route.fulfill({ json: { developerOptions: developerEnabled }, headers }); }
        if (url.pathname === '/api/auto-tune/image') return route.fulfill({ body: Buffer.from(image), contentType: 'image/png', headers });
        const response = await route.fetch({ url: endpoint + url.pathname + url.search });
        await route.fulfill({ response, headers: { ...response.headers(), 'access-control-allow-origin': '*' } });
      });
      await page.routeWebSocket('**/ws/**', () => {});
      await page.goto(frontend);
      const tabs = page.locator('.workspace-tabs--primary');
      if (c.state === 'empty') {
        assert.equal(await tabs.getByRole('button', { name: tr('Automated tuning'), exact: true }).count(), 0);
        await page.getByRole('button', { name: tr('App Menu'), exact: true }).click();
        await page.getByRole('menuitem', { name: tr('Settings'), exact: true }).click();
        await page.locator('#settings-developer-options').click();
        await page.waitForFunction(() => document.querySelector('#settings-developer-options')?.checked === true);
        await page.screenshot({ path: path.join(output, 'developer-options.png') });
        await page.keyboard.press('Escape');
      }
      await tabs.getByRole('button', { name: tr('Automated tuning'), exact: true }).click();
      await page.locator('[data-workspace="auto-tune"] h2').waitFor();
      await page.waitForTimeout(400);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert(!overflow, JSON.stringify(c) + ': document overflow');
      assert.equal(errors.length, 0, JSON.stringify(errors));
      const file = `${c.core}-${c.mode}-${c.width}-${c.language}-${c.state}.png`;
      await page.screenshot({ path: path.join(output, file) });
      if (c.width === 320) {
        await page.getByRole('log').scrollIntoViewIfNeeded();
        // Give composited glass surfaces a paint after the scroll completes.
        await page.waitForTimeout(200);
        await page.screenshot({ path: path.join(output, file.replace('.png', '-history.png')) });
      }
      if (c.width === 1280 && c.state === 'completed' && ['default', 'swiss', 'rhine-lab'].includes(c.core)) {
        await page.getByRole('button', { name: tr('App Menu'), exact: true }).click();
        await page.getByRole('menuitem', { name: tr('Settings'), exact: true }).click();
        await page.locator('#settings-developer-options').waitFor();
        await page.screenshot({ path: path.join(output, `${c.core}-${c.mode}-settings.png`) });
      }
      results.push({ ...c, file, errors, overflow });
      await page.unrouteAll({ behavior: 'wait' });
      await page.close();
    }
    const sources = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', 'frontend/src', 'lang'], { cwd: root }).toString().trim().split(/\r?\n/);
    fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({ date: new Date().toISOString(), base: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim(), browser: browser.version(), gameFrameSha256: gameFrame ? hash(gameFrame) : null, environment: 'Windows Chromium, actual AppShell/providers and isolated Rust HTTP. Native platform marker and automated-tuning HTTP are explicit presentation fixtures; remaining HTTP uses the isolated Rust backend. Run values are presentation fixtures, not game acceptance. 100% zoom, DPR 1, reduced motion. Latest image is an archived real game frame when gameFrameSha256 is present, otherwise its placeholder.', sources: Object.fromEntries([...new Set(sources)].map(p => [p, hash(path.join(root, p))])), cases: results }, null, 2) + '\n');
    console.log(JSON.stringify(results, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { for (const c of children.reverse()) { c.stdin?.end(); if (c.exitCode === null) c.kill(); } });
