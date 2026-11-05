// Opt-in Windows smoke: requires default-feature backend and Tauri debug builds,
// Vite on localhost:1420, and task-local Playwright. Uses isolated data and WebView profile.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = path.resolve(__dirname, '../../../../../..');
const scratch = path.join(root, 'scratch'); fs.mkdirSync(scratch, { recursive: true });
const out = process.env.OUTPUT_DIR ? path.resolve(process.env.OUTPUT_DIR) : fs.mkdtempSync(path.join(scratch, 'hud-native-restart-'));
fs.mkdirSync(out, { recursive: true });
const dataDir = path.join(out, 'data'); fs.mkdirSync(dataDir, { recursive: true });
const report = { kind: 'Windows Tauri debug host + real Rust HTTP backend; isolated data, no game', checks: [], pids: [], screenshots: [] };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function port() { return new Promise(resolve => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const value = server.address().port; server.close(() => resolve(value)); }); }); }
async function until(fn, label, timeout = 30000) { const end = Date.now() + timeout; let error; while (Date.now() < end) { try { const value = await fn(); if (value) return value; } catch (e) { error = e; } await delay(200); } throw new Error(label + ': ' + error); }
function child(file, args, env, label) {
  const proc = spawn(file, args, { cwd: root, env: { ...process.env, ...env }, windowsHide: true, stdio: ['pipe','pipe','pipe'] });
  const stream = fs.createWriteStream(path.join(out, label + '.log'));
  proc.stdout.pipe(stream, { end: false }); proc.stderr.pipe(stream, { end: false });
  proc.on('exit', () => stream.end()); report.pids.push({ label, pid: proc.pid }); return proc;
}
let backend, app, browser;
async function main() {
  fs.writeFileSync(path.join(dataDir, 'settings.json'), JSON.stringify({ language: 'en-us', race_recording: false, discord_rpc_enabled: false }));
  fs.writeFileSync(path.join(dataDir, 'hud_config.json'), JSON.stringify({ enabled: true, hudStyle: 'vfd', audioHeadScale: 0.8, pauseTelemetryViewWhenActive: true, smokeUnknown: 'keep', elements: { showGauge: true } }));
  backend = child(path.join(root, 'backend-rust/target/debug/server-sidecar.exe'), ['--port', '0', '--data-dir', dataDir], { TELEMETRY_PORT: '0' }, 'backend');
  let stdout = ''; backend.stdout.on('data', chunk => { stdout += chunk; });
  const backendPort = await until(() => { const match = stdout.match(/FH6_BACKEND_READY:(.*)/); return match && JSON.parse(match[1]).port; }, 'backend readiness');
  report.backendPort = backendPort;
  const readConfig = async () => (await fetch(`http://127.0.0.1:${backendPort}/api/overlay/config`)).json();
  assert.equal((await readConfig()).enabled, true);
  async function launch(round) {
    const debugPort = await port();
    app = child(path.join(root, 'frontend/src-tauri/target/debug/FH6-HorizonTuner.exe'), ['--no-sidecar'], {
      BACKEND_PORT: String(backendPort), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${debugPort}`,
      WEBVIEW2_USER_DATA_FOLDER: path.join(out, 'webview-profile'),
    }, 'app-' + round);
    await until(async () => (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).ok, 'WebView2 debugger');
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
    const page = await until(() => browser.contexts().flatMap(c => c.pages()).find(p => p.url().includes('localhost:1420')), 'main WebView');
    page.setDefaultTimeout(15000);
    await page.evaluate(() => localStorage.setItem('fh6-data-out-guide/v1', 'skipped'));
    await page.reload();
    await page.locator('.workspace-tabs--primary').waitFor();
    const infoClose = page.locator('.app-header .popover .btn-close'); if (await infoClose.isVisible()) await infoClose.click();
    await page.locator('.workspace-tabs--primary').getByRole('button', { name: 'HUD', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.hud-status')?.dataset.state === 'synced');
    return page;
  }
  async function close(page) {
    const pid = app.pid;
    // Address the main window explicitly; the focused click-through overlay can
    // otherwise be mistaken for Process.MainWindowHandle by Win32 automation.
    await page.evaluate(() => window.__TAURI__.core.invoke('plugin:window|close', { label: 'main' })).catch(error => {
      if (!/Target.*closed|Execution context.*destroyed/.test(String(error))) throw error;
    });
    await until(() => app.exitCode !== null, 'main process normal exit');
    report.checks.push('Normal main-window close exited task-owned Tauri process ' + pid);
    app = null; browser = null;
  }
  let page = await launch(1);
  await until(async () => (await readConfig()).enabled === false, 'startup stale flag correction');
  assert.equal(await page.evaluate(() => window.__TAURI__.core.invoke('get_hud_window_visible')), false);
  await page.getByRole('button', { name: 'Launch HUD Overlay', exact: true }).click();
  await until(async () => (await readConfig()).enabled === true, 'enable persisted');
  assert.equal(await page.evaluate(() => window.__TAURI__.core.invoke('get_hud_window_visible')), true);
  report.checks.push('Real native window is visible after launch; HTTP and disk enabled are true');
  await page.screenshot({ path: path.join(out, 'native-before-close.png') }); report.screenshots.push('native-before-close.png');
  await close(page); assert.equal((await readConfig()).enabled, true);
  page = await launch(2);
  await until(async () => (await readConfig()).enabled === false, 'relaunch correction');
  assert.equal(await page.evaluate(() => window.__TAURI__.core.invoke('get_hud_window_visible')), false);
  assert.equal(await page.getByRole('button', { name: 'Launch HUD Overlay', exact: true }).isEnabled(), true);
  assert.equal((await readConfig()).smokeUnknown, 'keep'); assert.equal((await readConfig()).audioHeadScale, 0.8);
  report.checks.push('Restarted native host corrects saved enabled=true to false while preserving other settings');
  await page.screenshot({ path: path.join(out, 'native-after-restart.png') }); report.screenshots.push('native-after-restart.png');
  await page.locator('.workspace-tabs--primary').getByRole('button', { name: 'Live', exact: true }).click();
  await page.waitForFunction(() => window.__IS_HUD_PAUSED__ === false);
  report.checks.push('Actual Live workspace is not paused after restart');
  await page.screenshot({ path: path.join(out, 'native-after-restart-live.png') }); report.screenshots.push('native-after-restart-live.png');
  await close(page);
}
main().catch(error => { report.error = String(error.stack || error); console.error(error); process.exitCode = 1; }).finally(async () => {
  if (app?.exitCode === null) app.kill();
  if (backend?.exitCode === null) { backend.stdin.end(); await delay(500); if (backend.exitCode === null) backend.kill(); }
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
});
