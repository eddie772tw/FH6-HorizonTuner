// Windows: build server-sidecar with default features and set PLAYWRIGHT_MODULE_PATH.
// Start an isolated backend and select each shipped style in the production AppShell.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');
const { once } = require('node:events');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');

const root = path.resolve(__dirname, '../../..');
const frontend = path.join(root, 'frontend');
const scratch = path.join(root, 'scratch');
fs.mkdirSync(scratch, { recursive: true });
const out = fs.mkdtempSync(path.join(scratch, 'toyota-render-'));
const ids = ['altezza_trd', 'chaser_jzx100', 'soarer_z20', 'supra_trd'];
const frameData = { is_race_on: true, rpm: 4200, max_rpm: 8000, speed_kmh: 116, gear: 4,
  throttle: 0.55, fuel_ratio: 0.65, boost_bar: 0.45, tire_temp_f: [194, 196, 198, 200] };
const report = { source: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), platform: 'Windows, sandboxed Edge, DPR 1',
  backend: 'Default-feature Rust server-sidecar; temporary data and ephemeral ports', frameData,
  settingsViewport: [1280, 720], hudViewport: [1920, 1080], userScale: 1, background: '#161b22',
  styles: [], images: [], errors: [] };

async function main() {
  const data = path.join(out, 'data');
  fs.mkdirSync(data);
  const defaults = JSON.parse(fs.readFileSync(path.join(root, 'backend-rust/resources/defaults.json')));
  const config = { ...defaults.DEFAULT_HUD_CONFIG, enabled: true, scale: 1, hudStyle: 'simple',
    elements: { ...defaults.DEFAULT_HUD_CONFIG.elements, showGauge: true, showAudioHead: false,
      showAuxiliaryGauges: false, showTeleMaster: false, showTeleCenterAnchor: false, showTeleGridLines: false } };
  fs.writeFileSync(path.join(data, 'hud_config.json'), JSON.stringify(config));
  fs.writeFileSync(path.join(data, 'settings.json'), JSON.stringify({ ...defaults.DEFAULT_SETTINGS, language: 'zh-tw', race_recording: false, discord_rpc_enabled: false }));
  const child = spawn(path.join(root, 'backend-rust/target/debug/server-sidecar.exe'),
    ['--port', '0', '--data-dir', data], { cwd: root, windowsHide: true, stdio: ['pipe', 'pipe', 'inherit'], env: { ...process.env, TELEMETRY_PORT: '0' } });
  let browser, server;
  async function shot(target, file) {
    const bytes = await target.screenshot({ path: path.join(out, file), animations: 'disabled' });
    report.images.push({ file, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  try {
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Backend startup timeout')), 30000);
      let output = '';
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(Error('Backend exited: ' + code)); });
      child.stdout.on('data', bytes => {
        output += bytes.toString();
        const match = output.match(/FH6_BACKEND_READY:(\{[^\n]*\})/);
        if (match) { clearTimeout(timer); resolve(JSON.parse(match[1]).port); }
      });
    });
    const backend = 'http://127.0.0.1:' + port;
    const { styles } = await (await fetch(backend + '/api/hud/styles')).json();
    for (const id of ids) assert(styles.some(style => style.id === id && style.source === 'builtin'), id + ' must be shipped');
    process.env.FH6_PLATFORM = 'windows';
    process.chdir(frontend);
    const { createServer } = await import(pathToFileURL(require.resolve('vite', { paths: [frontend] })).href);
    server = await createServer({ root: frontend, configFile: path.join(frontend, 'vite.config.ts'), cacheDir: path.join(out, 'vite-cache'),
      server: { host: '127.0.0.1', port: 0, proxy: { '/api': backend } }, logLevel: 'warn' });
    await server.listen();
    const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true, chromiumSandbox: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    await context.routeWebSocket(/\/ws\/(telemetry|overlay)$/, () => {});
    await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
    await context.addInitScript(() => localStorage.setItem('fh6-data-out-guide/v1', 'skipped'));
    const settings = await context.newPage();
    const hud = await context.newPage();
    const errors = error => report.errors.push(String(error));
    for (const page of [settings, hud]) {
      page.on('pageerror', errors);
      page.on('response', response => { if (response.url().includes('/hud/') && response.status() >= 400) errors(response.url()); });
    }
    await hud.setViewportSize({ width: 1920, height: 1080 });
    await settings.goto(origin + '/src/features/overlay_control/tests/browser/index.html?shell');
    await settings.locator('.app-header .popover .btn-close').click();
    await settings.locator('.workspace-tabs--primary').getByRole('button', { name: 'HUD', exact: true }).click();
    const selector = settings.getByRole('tabpanel').locator('select').first();
    for (const id of ids) {
      await settings.bringToFront();
      await selector.selectOption(id);
      await settings.waitForFunction(() => document.querySelector('.hud-status')?.dataset.state === 'synced');
      assert.equal((await (await fetch(backend + '/api/overlay/config')).json()).hudStyle, id);
      if (id === ids[0]) {
        for (const core of ['default', 'swiss', 'rhine-lab']) for (const mode of ['light', 'dark']) {
          await settings.evaluate(theme => window.hudSettingsFixtureTheme.update(theme), { halfmoonCore: core, mode });
          await settings.waitForFunction(({ core, mode }) => document.documentElement.dataset.bsCore === core && document.documentElement.dataset.bsTheme === mode, { core, mode });
          await shot(settings, 'settings-' + core + '-' + mode + '.png');
        }
        await settings.setViewportSize({ width: 320, height: 720 });
        await selector.scrollIntoViewIfNeeded();
        assert(await settings.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await shot(settings, 'settings-narrow.png');
        await settings.setViewportSize({ width: 1280, height: 720 });
        await hud.goto(origin + '/hud/index.html');
        await hud.addStyleTag({ content: 'html { background: #161b22 !important; }' });
      }
      await hud.bringToFront();
      const gauge = hud.frameLocator('iframe[src*="/' + id + '/index.html"]').locator('.hud-gauge-container');
      await gauge.waitFor({ state: 'visible' });
      await hud.waitForLoadState('networkidle');
      // All four original renderers run a 1200 ms startup sweep.
      await hud.waitForTimeout(1500);
      const frame = hud.frames().find(f => new URL(f.url()).pathname.endsWith('/' + id + '/index.html'));
      async function draw(data) {
        await hud.evaluate(data => dispatchEvent(new CustomEvent('hud:frame', { detail: { data } })), data);
        return frame.evaluate(async () => {
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const canvas = document.querySelector('.hud-gauge-container canvas');
          const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
          return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', pixels)), b => b.toString(16).padStart(2, '0')).join('');
        });
      }
      const idleHash = await draw({ ...frameData, rpm: 0, speed_kmh: 0, gear: 0 });
      const drivingHash = await draw(frameData);
      assert.notEqual(drivingHash, idleHash, id + ' must render the supplied telemetry');
      const bounds = await gauge.boundingBox();
      assert(bounds.x >= -1 && bounds.y >= -1 && bounds.x + bounds.width <= 1921 && bounds.y + bounds.height <= 1081, id + ' clipped');
      await shot(hud, id + '-1080p.png');
      await shot(gauge, id + '.png');
      report.styles.push({ id, bounds, idleHash, drivingHash });
    }
    assert.deepEqual(report.errors, []);
  } finally {
    await browser?.close();
    await server?.close();
    if (child.exitCode === null) {
      const stopped = once(child, 'exit');
      child.stdin.end();
      const timer = setTimeout(() => child.kill(), 3000);
      await stopped; clearTimeout(timer);
    }
    fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(out);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
