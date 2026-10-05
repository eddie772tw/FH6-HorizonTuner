/* Opt-in browser acceptance of the real OverlayView and persisted runtime.
 * A disk-backed HTTP fixture is used; Rust tests own actual API normalization. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
async function main() {
  const repo = path.resolve(__dirname, '../../../../../../..'), frontend = path.join(repo, 'frontend');
  const out = path.join(process.env.OUTPUT_DIR || '/tmp/hud-r34-mfd-preview', 'settings'); fs.mkdirSync(out, { recursive: true });
  const configPath = path.join(out, 'fixture-hud-config.json');
  const defaults = JSON.parse(fs.readFileSync(path.join(repo, 'backend-rust/resources/defaults.json'), 'utf8'));
  fs.writeFileSync(configPath, JSON.stringify({ ...defaults.DEFAULT_HUD_CONFIG, hudStyle: 'simple', fixtureUnknownField: 42,
    elements: { ...defaults.DEFAULT_HUD_CONFIG.elements, showTeleMaster: false } }));
  const read = () => JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const report = { scope: 'Real React settings and runtime, disk-backed HTTP fixture; not native/game acceptance', saves: [], screenshots: [], checks: [], errors: [] };
  const json = (res, body, status = 200) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  const api = { name: 'r34-browser-fixture-api', configureServer(server) { server.middlewares.use((req, res, next) => {
    const name = new URL(req.url, 'http://localhost').pathname;
    if (name === '/api/overlay/config') {
      if (req.method !== 'POST') return json(res, read());
      let body = ''; req.on('data', chunk => { body += chunk; }); req.on('end', () => {
        try { const value = JSON.parse(body); fs.writeFileSync(configPath, JSON.stringify(value)); report.saves.push(value); json(res, { success: true }); }
        catch (error) { json(res, { success: false, error: String(error) }, 400); }
      }); return;
    }
    if (name === '/api/settings') {
      const query = new URL(req.headers.referer || 'http://localhost').searchParams;
      return json(res, { ...defaults.DEFAULT_SETTINGS, language: query.get('language') || 'en-us', units: { ...defaults.DEFAULT_SETTINGS.units, temperature: query.get('temperature') === 'F' ? 'F' : 'C' } });
    }
    if (name === '/api/languages') return json(res, [{ code: 'en-us', name: 'English' }, { code: 'zh-tw', name: '繁體中文' }, { code: 'ja-jp', name: '日本語' }]);
    if (name.startsWith('/api/languages/')) { const code = name.split('/').pop(); return json(res, ['en-us', 'zh-tw', 'ja-jp'].includes(code) ? JSON.parse(fs.readFileSync(path.join(repo, 'lang', code + '.json'), 'utf8')) : {}); }
    if (name === '/api/audio/devices') return json(res, [{ id: 'default', name: 'System Default Speaker', is_default: true }]);
    if (name === '/api/hud/styles') return json(res, { styles: ['r34_mfd', 'simple', 'vfd'].map(id => ({ id, source: 'builtin', urlPrefix: '/hud' })) });
    if (name.startsWith('/api/')) return json(res, { error: 'Unexpected fixture endpoint: ' + name }, 404);
    next();
  }); } };
  process.env.FH6_PLATFORM = 'windows'; process.chdir(frontend);
  const { createServer } = await import(pathToFileURL(require.resolve('vite', { paths: [frontend] })).href);
  const server = await createServer({ root: frontend, configFile: path.join(frontend, 'vite.config.ts'), plugins: [api], server: { host: '127.0.0.1', port: 0, strictPort: false }, logLevel: 'warn' });
  let browser, page;
  try {
    await server.listen(); const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
    browser = await chromium.launch({ headless: true, chromiumSandbox: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    page = await context.newPage(); page.on('pageerror', e => report.errors.push(e.message));
    page.on('response', response => { if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) report.errors.push(response.status() + ' ' + response.url()); });
    await page.addInitScript(() => { window.fixtureBroadcasts = []; const channel = new BroadcastChannel('horizon_tuner_hud_channel'); channel.onmessage = e => window.fixtureBroadcasts.push(e.data); });
    const open = async query => {
      await page.goto(origin + '/src/features/overlay_control/r34_mfd/tests/browser/index.html' + (query || ''));
      await page.locator('details.hud-advanced-settings > summary').click();
      await page.waitForFunction(() => !document.querySelector('select[id$="-style"]')?.disabled);
    };
    const savedAs = async expected => page.waitForFunction(async values => {
      const config = await (await fetch('/api/overlay/config')).json(); return Object.entries(values).every(([key, value]) => config[key] === value);
    }, expected);
    const card = () => page.getByRole('group', { name: 'R34 MFD settings', exact: true });
    const style = () => page.getByRole('combobox', { name: 'Speedometer Settings', exact: true });
    const helper = "R34 core dials and five NISMO MFD Ver.II pages. Change pages here. Auxiliary gauges show boost and all-four average tire temperature, not coolant. Missing inputs remain N/A.";
    const capture = async (name, target = card()) => {
      await target.scrollIntoViewIfNeeded();
      const expectedHelper = name.endsWith('zh-tw') || name.endsWith('ja-jp')
        ? JSON.parse(fs.readFileSync(path.join(repo, 'lang', name.endsWith('zh-tw') ? 'zh-tw.json' : 'ja-jp.json'), 'utf8'))[helper] : helper;
      assert.equal((await target.locator('p').textContent()).trim(), expectedHelper, 'Settings helper must be the complete localized sentence');
      const layout = await target.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        const controls = [...element.querySelectorAll('select,input')].map(node => { const r = node.getBoundingClientRect(); return { label: node.labels?.[0]?.textContent, left: r.left, right: r.right, width: r.width }; });
        return { viewport: innerWidth, fits: bounds.left >= 0 && bounds.right <= innerWidth && element.scrollWidth <= element.clientWidth + 1, controls };
      });
      assert(layout.fits && layout.controls.every(control => control.label && control.width > 0 && control.left >= 0 && control.right <= layout.viewport), name + ' clipped settings');
      await target.screenshot({ path: path.join(out, name + '.png') }); report.screenshots.push({ name, ...layout });
    };
    await open(); assert.equal(await card().count(), 0); await style().selectOption('r34_mfd'); await card().waitFor({ state: 'visible' });
    await savedAs({ r34MfdMode: 'single', r34ShowCluster: true, r34Lighting: 'night' });
    for (const mode of ['single', 'twin', 'multi', 'g', 'lap']) { await card().getByRole('combobox', { name: 'R34 MFD mode', exact: true }).selectOption(mode); await savedAs({ r34MfdMode: mode }); }
    for (const lighting of ['day', 'night']) { await card().getByRole('combobox', { name: 'R34 instrument lighting', exact: true }).selectOption(lighting); await savedAs({ r34Lighting: lighting }); await capture('controls-' + lighting); }
    await card().getByRole('checkbox', { name: 'R34 show instrument cluster', exact: true }).uncheck();
    await savedAs({ r34ShowCluster: false, r34MfdMode: 'lap' });
    await page.waitForFunction(() => window.fixtureBroadcasts.some(message => message.type === 'config' && message.data.r34MfdMode === 'lap' && message.data.r34ShowCluster === false));
    assert.equal(read().fixtureUnknownField, 42); assert.equal(read().effectiveUnits, undefined);
    await open(); await card().waitFor({ state: 'visible' }); assert.equal(await card().getByRole('combobox', { name: 'R34 MFD mode', exact: true }).inputValue(), 'lap');
    assert.equal(await card().getByRole('checkbox', { name: 'R34 show instrument cluster', exact: true }).isChecked(), false);
    report.checks.push('All five modes, day/night, cluster control, disk persistence, effective-unit separation, BroadcastChannel and reload');
    await open('?temperature=F'); await card().waitFor({ state: 'visible' });
    const unitPanel = () => page.getByRole('dialog', { name: 'HUD Unit Settings', exact: true });
    const openUnits = async () => { await page.getByRole('button', { name: 'HUD Unit Settings', exact: true }).click(); await unitPanel().waitFor({ state: 'visible' }); };
    await openUnits();
    assert.equal(await unitPanel().getByRole('combobox', { name: 'Temperature', exact: true }).inputValue(), 'F');
    assert.equal(await unitPanel().getByRole('combobox', { name: 'Temperature', exact: true }).isDisabled(), true);
    await page.waitForFunction(() => window.fixtureBroadcasts.some(message => message.data?.effectiveUnits?.temperature === 'F'));
    await unitPanel().getByRole('checkbox', { name: 'Follow App Global Units', exact: true }).uncheck();
    await unitPanel().getByRole('combobox', { name: 'Temperature', exact: true }).selectOption('C');
    await page.waitForFunction(async () => { const c = await (await fetch('/api/overlay/config')).json(); return c.followAppUnits === false && c.units.temperature === 'C'; });
    await unitPanel().getByRole('combobox', { name: 'Temperature', exact: true }).selectOption('F');
    await page.waitForFunction(async () => (await (await fetch('/api/overlay/config')).json()).units.temperature === 'F');
    await unitPanel().screenshot({ path: path.join(out, 'temperature-independent-f.png') }); report.screenshots.push({ name: 'temperature-independent-f' });
    await unitPanel().getByRole('button', { name: 'Close Unit Settings', exact: true }).click();
    await open(); await card().waitFor({ state: 'visible' }); await openUnits();
    assert.equal(await unitPanel().getByRole('combobox', { name: 'Temperature', exact: true }).inputValue(), 'F');
    assert.equal(await unitPanel().getByRole('combobox', { name: 'Temperature', exact: true }).isEnabled(), true);
    assert.equal(read().effectiveUnits, undefined);
    await unitPanel().getByRole('button', { name: 'Close Unit Settings', exact: true }).click();
    report.checks.push('Temperature app inheritance, independent C/F control, disk persistence, reload and derived-unit separation');
    for (const theme of ['dark', 'light']) for (const core of ['default', 'modern', 'elegant']) {
      await page.evaluate(({ theme, core }) => { document.documentElement.dataset.bsTheme = theme; document.documentElement.dataset.bsCore = core; }, { theme, core });
      await capture('settings-' + theme + '-' + core);
    }
    await page.setViewportSize({ width: 390, height: 844 }); await capture('settings-narrow'); await page.setViewportSize({ width: 1440, height: 1100 });
    await style().selectOption('simple'); await card().waitFor({ state: 'detached' }); await style().selectOption('r34_mfd'); await card().waitFor({ state: 'visible' });
    await savedAs({ r34MfdMode: 'lap', r34ShowCluster: false });
    const before = report.saves.length; page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('button', { name: 'Reset HUD Settings', exact: true }).click(); assert.equal(report.saves.length, before);
    page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Reset HUD Settings', exact: true }).click();
    await card().waitFor({ state: 'detached' }); await savedAs({ hudStyle: 'vfd', r34MfdMode: 'single', r34Lighting: 'night', r34ShowCluster: true });
    assert.equal(read().units.temperature, 'C');
    await style().selectOption('r34_mfd'); await card().waitFor({ state: 'visible' }); report.checks.push('Style round-trip, reset cancel and confirmed defaults');
    for (const language of ['zh-tw', 'ja-jp']) {
      const translations = JSON.parse(fs.readFileSync(path.join(repo, 'lang', language + '.json'), 'utf8'));
      await page.setViewportSize({ width: 390, height: 844 }); await open('?language=' + language);
      const translated = page.getByRole('group', { name: translations['R34 MFD settings'], exact: true }); await translated.waitFor({ state: 'visible' });
      const glyphs = await translated.evaluate(async (element, language) => {
        const family = language === 'zh-tw' ? 'Noto Sans CJK TC' : 'Noto Sans CJK JP'; await new FontFace('R34CjkProbe', `local("${family}")`).load(); await document.fonts.ready;
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64; const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.font = `400 32px ${getComputedStyle(element).fontFamily}`; const probes = language === 'zh-tw' ? ['儀', '錶', '模'] : ['モ', 'ー', 'ド'];
        const ink = probes.map(glyph => { ctx.clearRect(0, 0, 64, 64); ctx.fillText(glyph, 8, 44); return Array.from(ctx.getImageData(0, 0, 64, 64).data).filter((_, i) => i % 4 === 3); });
        return { family, nonempty: ink.every(pixels => pixels.some(alpha => alpha > 0)), distinct: new Set(ink.map(pixels => pixels.join(','))).size === probes.length };
      }, language);
      assert(glyphs.nonempty && glyphs.distinct, language + ' missing CJK glyphs'); await capture('settings-narrow-' + language, translated); report.screenshots.at(-1).glyphs = glyphs;
    }
    assert.deepEqual(report.errors, []);
  } catch (error) { report.errors.push(String(error)); await page?.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }).catch(() => {}); throw error; }
  finally { fs.writeFileSync(path.join(out, 'settings-audit.json'), JSON.stringify(report, null, 2) + '\n'); await browser?.close(); await server.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
