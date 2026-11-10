const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const puppeteer = require('/tmp/browser/node_modules/puppeteer-core');

const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'frontend/dist');
const outDir = path.join(root, 'docs/visual-review/companion-adb-lifecycle');
fs.mkdirSync(outDir, { recursive: true });

let serverState = {
  companion_enabled: true,
  companion_usb_enabled: false,
  language: 'zh-tw'
};

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', '*');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url, 'http://127.0.0.1:8001');

  if (url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(fs.readFileSync(path.join(distDir, 'index.html')));
  }

  if (url.pathname.startsWith('/assets/')) {
    const filePath = path.join(distDir, url.pathname);
    if (fs.existsSync(filePath)) {
      const ext = path.extname(filePath);
      const ct = ext === '.js' ? 'application/javascript' : ext === '.css' ? 'text/css' : 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': ct });
      return res.end(fs.readFileSync(filePath));
    }
  }

  if (url.pathname === '/api/runtime') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      platform: 'windows',
      capabilities: { hudOverlay: true, audioSpectrum: true, systemMedia: true, localMotecLaunch: true },
      telemetry: { port: 8000, listenAddresses: ['127.0.0.1'], error: null }
    }));
  }

  if (url.pathname === '/api/settings') {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const patch = JSON.parse(body);
          Object.assign(serverState, patch);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(serverState));
        } catch {
          res.writeHead(400);
          res.end('{}');
        }
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(serverState));
  }

  if (url.pathname === '/api/languages') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify([
      { code: 'en-us', name: 'English' },
      { code: 'zh-tw', name: '繁體中文' },
      { code: 'ja-jp', name: '日本語' }
    ]));
  }

  if (url.pathname.startsWith('/api/languages/')) {
    const lang = url.pathname.slice('/api/languages/'.length);
    const langPath = path.join(root, 'lang', lang + '.json');
    if (fs.existsSync(langPath)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(fs.readFileSync(langPath));
    }
  }

  if (url.pathname === '/api/companion/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      enabled: serverState.companion_enabled,
      active_connections: 0,
      paired_devices_count: 0
    }));
  }

  if (url.pathname === '/api/companion/qr') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      token: 'SENTINEL-PAIRING-TOKEN-2026',
      lan_ips: ['192.168.1.108'],
      port: 8001
    }));
  }

  if (url.pathname === '/api/companion/usb/devices') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      devices: [
        { serial: 'emulator-5554', state: 'device', model: 'Pixel 8 Pro' },
        { serial: 'device-offline-1', state: 'offline', model: 'Galaxy S24' }
      ]
    }));
  }

  if (url.pathname === '/api/companion/usb/kill') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true }));
  }

  if (url.pathname === '/api/car_params/list') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify([]));
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({}));
});

(async () => {
  await new Promise(resolve => server.listen(8001, '127.0.0.1', resolve));
  console.log('Test harness server listening on http://127.0.0.1:8001');

  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });

  const commitHash = require('child_process').execSync('git rev-parse HEAD', { cwd: root }).toString().trim();
  const cases = [
    // Primary showcase cases
    {
      core: 'default', mode: 'dark', lang: 'zh-tw', width: 1280, height: 720,
      companion_enabled: true, companion_usb_enabled: false,
      save: true, file: 'default-dark-zh-tw-1280-companion-wifi-only.png',
      desc: 'Default dark mode (zh-tw) - Default state: LAN Wi-Fi pairing enabled, USB ADB disabled'
    },
    {
      core: 'default', mode: 'dark', lang: 'en-us', width: 1280, height: 720,
      companion_enabled: false, companion_usb_enabled: false,
      save: true, file: 'default-dark-en-us-1280-companion-disabled.png',
      desc: 'Default dark mode (en-us) - Complete companion subsystem disabled state'
    },
    {
      core: 'default', mode: 'light', lang: 'ja-jp', width: 1280, height: 720,
      companion_enabled: true, companion_usb_enabled: true,
      save: true, file: 'default-light-ja-jp-1280-companion-usb-active.png',
      desc: 'Default light mode (ja-jp) - USB enabled with device list and Stop ADB daemon control'
    },
    {
      core: 'swiss', mode: 'dark', lang: 'zh-tw', width: 1280, height: 720,
      companion_enabled: true, companion_usb_enabled: true,
      save: true, file: 'swiss-dark-zh-tw-1280-companion-usb-active.png',
      desc: 'Swiss core dark mode (zh-tw) - USB enabled state with glassmorphism panels'
    },
    {
      core: 'rhine-lab', mode: 'light', lang: 'en-us', width: 1280, height: 720,
      companion_enabled: true, companion_usb_enabled: false,
      save: true, file: 'rhine-lab-light-en-us-1280-companion-wifi-only.png',
      desc: 'Rhine-Lab core light mode (en-us) - Default state with QR pairing and disabled USB note'
    },
    {
      core: 'default', mode: 'dark', lang: 'zh-tw', width: 320, height: 800,
      companion_enabled: true, companion_usb_enabled: true,
      save: true, file: 'default-dark-zh-tw-320-companion-usb-active.png',
      desc: 'Narrow responsive 320px viewport - Overflow verified with both switches active'
    },
    // Supporting design system cores verification
    {
      core: 'modern', mode: 'dark', lang: 'en-us', width: 1280, height: 720,
      companion_enabled: true, companion_usb_enabled: false, save: false
    },
    {
      core: 'elegant', mode: 'light', lang: 'ja-jp', width: 1280, height: 720,
      companion_enabled: true, companion_usb_enabled: true, save: false
    },
    {
      core: 'swiss-editorial', mode: 'dark', lang: 'zh-tw', width: 1280, height: 720,
      companion_enabled: true, companion_usb_enabled: false, save: false
    },
    {
      core: 'swiss-contrast', mode: 'light', lang: 'en-us', width: 1280, height: 720,
      companion_enabled: true, companion_usb_enabled: true, save: false
    }
  ];

  const results = [];

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    console.log(`Processing case ${i + 1}/${cases.length}: ${c.core}-${c.mode}-${c.lang}-${c.width} (save: ${c.save})`);
    
    serverState.companion_enabled = c.companion_enabled;
    serverState.companion_usb_enabled = c.companion_usb_enabled;
    serverState.language = c.lang;

    const page = await browser.newPage();
    await page.setViewport({ width: c.width, height: c.height, deviceScaleFactor: 1 });

    const theme = {
      halfmoonCore: c.core,
      mode: c.mode,
      primaryColor: '#00f0ff',
      secondaryColor: '#ff003c',
      accentColor: '#7000ff',
      customCSS: ''
    };

    await page.evaluateOnNewDocument(t => {
      localStorage.setItem('themeSettings', JSON.stringify(t));
      localStorage.setItem('fh6-data-out-guide/v1', 'skipped');
    }, theme);

    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto('http://127.0.0.1:8001', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('button[aria-haspopup="menu"]', { timeout: 10000 });

    // Open menu
    const menuBtn = await page.$('button[aria-haspopup="menu"]');
    await menuBtn.click();

    // Click Companion App
    const companionBtn = await page.evaluateHandle(() => {
      const items = Array.from(document.querySelectorAll('#app-menu-items button'));
      return items.find(el => el.textContent.includes('Companion') || el.textContent.includes('隨行') || el.textContent.includes('コンパニオン')) || items[2];
    });
    await companionBtn.click();

    // Wait for companion dialog to be shown
    await page.waitForSelector('.app-dialog--companion.show', { timeout: 5000 });
    await page.evaluate(() => document.fonts.ready);
    await new Promise(r => setTimeout(r, 450));

    // If USB is active, trigger refresh to populate mock devices
    if (c.companion_usb_enabled) {
      const refreshBtn = await page.$('button.btn-outline-secondary');
      if (refreshBtn) {
        await refreshBtn.click();
        await new Promise(r => setTimeout(r, 150));
      }
    }

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert(!overflow, `Case ${c.core}-${c.mode}-${c.width} caused horizontal document overflow!`);

    if (c.save) {
      const screenshotPath = path.join(outDir, c.file);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      console.log(`Saved screenshot: ${c.file}`);
    }

    results.push({
      core: c.core,
      mode: c.mode,
      lang: c.lang,
      width: c.width,
      companion_enabled: c.companion_enabled,
      companion_usb_enabled: c.companion_usb_enabled,
      save: c.save,
      file: c.save ? c.file : null,
      desc: c.desc || null,
      overflow,
      errors
    });

    assert.equal(errors.length, 0, `Page errors encountered in case ${i}: ${JSON.stringify(errors)}`);
    await page.close();
  }

  const manifest = {
    date: new Date().toISOString().split('T')[0],
    implementation: commitHash,
    productBlobs: {
      'frontend/src/features/settings/components/CompanionSettingsCard.tsx': 'HEAD',
      'frontend/src/features/settings/components/CompanionUsbControls.tsx': 'HEAD',
      'frontend/src/context/SettingsContext.tsx': 'HEAD',
      'backend-rust/src/app.rs': 'HEAD',
      'backend-rust/src/companion_usb.rs': 'HEAD'
    },
    browser: (await browser.version()),
    environment: 'Linux headless Chromium; full production AppShell/Halfmoon CSS; route-isolated HTTP backend; DPR 1; zoom 100%. Covers companion_enabled toggle, companion_usb_enabled toggle, ADB kill daemon button, QR Wi-Fi pairing visibility, light/dark themes, multi-language (zh-tw, en-us, ja-jp) and 320px responsive viewport.',
    cases: results
  };

  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log('Manifest written to docs/visual-review/companion-adb-lifecycle/manifest.json');

  await browser.close();
  server.close();
  console.log('Visual review capture completed successfully!');
})().catch(err => {
  console.error('Fatal error during capture:', err);
  server.close();
  process.exit(1);
});
