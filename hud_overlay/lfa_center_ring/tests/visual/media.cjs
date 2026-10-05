/* Real Launcher + Coordinator + HUDCore, controlled existing read-only media endpoints. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function verifyMedia({ browser, origin, config, raw, out }) {
  const report = { scope: 'Actual Launcher/HUDCore with controlled GET media health and hud:media events; not native Windows media acceptance', runs: [] };
  const absent = { success: true, has_media: false, state: 'unavailable', source: 'winrt' };
  const track = { success: true, state: 'live', source: 'winrt', has_media: true, title: 'Night Drive', artist: 'Horizon Fixture', album_title: 'Original Test Session', status: 'playing', start_seconds: 0, position_seconds: 0, duration_seconds: 240, thumbnail_available: true, thumbnail_url: '/api/overlay/media/thumbnail?v=blue' };
  const artwork = color => `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="${color}"/><circle cx="48" cy="48" r="27" fill="none" stroke="#edf7fa" stroke-width="2"/><circle cx="48" cy="48" r="5" fill="#edf7fa"/></svg>`;
  for (const [width, height, dpr, scale] of [[1280,720,1,1],[1920,1080,2,1],[1280,720,1,.8],[1920,1080,2,.8]]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr });
    const page = await context.newPage(), errors = [], samples = [], requests = [];
    let snapshot = absent, heldArt = null, frame;
    const tag = `${width}x${height}-dpr${dpr}-scale${scale}`;
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/overlay/system_media', route => { requests.push({ endpoint: 'system_media', method: route.request().method() }); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(snapshot) }); });
    await page.route(/\/api\/overlay\/media\/thumbnail\?v=/, async route => {
      const version = new URL(route.request().url()).searchParams.get('v');
      if (version === 'held') { heldArt = route; return; }
      if (version === 'broken') return route.fulfill({ status: 200, contentType: 'image/png', body: 'deliberately invalid image data' });
      return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: artwork(version === 'red' ? '#642d39' : '#234f62') });
    });
    await page.addInitScript(() => {
      class Socket { constructor(url) { this.url = url; this.readyState = 1; setTimeout(() => this.onopen?.({}), 30); } send() {} close() { this.readyState = 3; } }
      Socket.OPEN = 1; window.WebSocket = Socket;
    });
    let currentConfig = { ...config, scale, lfaManualExpand: false, lfaAutoExpand: false };
    const configure = async patch => {
      currentConfig = { ...currentConfig, ...patch };
      await page.evaluate(data => window.dispatchEvent(new CustomEvent('hud:config', { detail: data })), currentConfig);
    };
    async function media(value, event = true) {
      snapshot = value;
      if (event) await page.evaluate(data => window.dispatchEvent(new CustomEvent('hud:media', { detail: data })), value);
    }
    async function settled(expanded, pane) {
      await frame.waitForFunction(({ expanded, pane }) => { const node = document.getElementById('lfaContainer'); return node?.dataset.expanded === String(expanded) && node.dataset.expansionSettled === 'true' && (!pane || node.dataset.expandedPage === pane); }, { expanded, pane }, { timeout: 6000 });
    }
    async function bounds() {
      const result = await frame.evaluate(async () => {
        const documentSource = new DOMParser().parseFromString(await (await fetch('assets/media-pane.svg')).text(), 'image/svg+xml').documentElement;
        documentSource.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none'; document.body.appendChild(documentSource);
        try {
          const surface = documentSource.querySelector('#expandedSurface'), circle = documentSource.querySelector('#expandedRingCutout');
          const cx = circle.cx.baseVal.value, cy = circle.cy.baseVal.value, radius = circle.r.baseVal.value;
          const list = [...document.querySelectorAll('#lfaMediaPage > text, #lfaMediaPage > foreignObject')].map(node => { const b = node.getBBox(); return { name: node.id || node.tagName, x: b.x, y: b.y, width: b.width, height: b.height }; });
          const outside = [], intersections = [], overlaps = [];
          for (let i = 0; i < list.length; i++) {
            const a = list[i], left = a.x - 2, right = a.x + a.width + 2, top = a.y - 2, bottom = a.y + a.height + 2;
            for (const [x1,y1,x2,y2] of [[left,top,right,top],[right,top,right,bottom],[right,bottom,left,bottom],[left,bottom,left,top]]) {
              const steps = Math.max(1, Math.ceil(Math.hypot(x2-x1,y2-y1)));
              for (let n = 0; n <= steps; n++) if (!surface.isPointInFill(new DOMPoint(x1+(x2-x1)*n/steps,y1+(y2-y1)*n/steps))) { outside.push(a.name); break; }
            }
            if (Math.hypot(Math.max(left,Math.min(right,cx))-cx,Math.max(top,Math.min(bottom,cy))-cy) <= radius) intersections.push(a.name);
            for (const b of list.slice(i+1)) if (a.x < b.x+b.width && a.x+a.width > b.x && a.y < b.y+b.height && a.y+a.height > b.y) overlaps.push([a.name,b.name]);
          }
          const title = document.getElementById('lfaMediaTitle');
          const titleStyle = getComputedStyle(title);
          const metadata = ['Title', 'Artist', 'Album'].map(name => {
            const node = document.getElementById('lfaMedia' + name), child = node.getBoundingClientRect(), host = node.parentElement.getBoundingClientRect();
            return { name, contained: child.left >= host.left && child.top >= host.top && child.right <= host.right && child.bottom <= host.bottom };
          });
          return { bounds: list, outside, intersections, overlaps, metadata, titleHeight: parseFloat(titleStyle.height), titleLineHeight: parseFloat(titleStyle.lineHeight), titleChildren: title.childElementCount, titleText: title.textContent };
        } finally { documentSource.remove(); }
      });
      assert.deepEqual(result.outside, []); assert.deepEqual(result.intersections, []); assert.deepEqual(result.overlaps, []); assert.equal(result.titleChildren, 0);
      assert.ok(result.titleHeight <= result.titleLineHeight * 2, 'Title block must end at the second line, with no third-line sliver');
      assert.ok(result.metadata.every(item => item.contained), 'Actual HTML metadata must fit its SVG host');
      return result;
    }
    async function capture(name, checkBounds = true) {
      const state = await frame.evaluate(() => { const get = id => document.getElementById('lfa'+id); return { page: get('Container').dataset.expandedPage, expanded: get('Container').dataset.expanded, title: get('MediaTitle').textContent, artist: get('MediaArtist').textContent, album: get('MediaAlbum').textContent, status: get('MediaStatus').textContent, position: get('MediaPosition').textContent, duration: get('MediaDuration').textContent, fallback: !get('MediaArtFallback').hidden }; });
      samples.push({ name, ...state, geometry: checkBounds && state.page === 'media' ? await bounds() : null });
      await frame.locator('#lfaContainer').screenshot({ path: path.join(out, `media-${name}-${tag}.png`), omitBackground: true });
    }
    try {
      await page.goto(origin + '/hud/index.html');
      await page.waitForFunction(() => document.querySelector('#hud-iframe')?.contentWindow?.HUDCore?.getActiveStyle());
      frame = page.frames().find(f => f.url().includes('/lfa_center_ring/index.html'));
      await configure({});
      await page.evaluate(data => {
        window.mediaRaw = { ...data, CurrentLap: 0, CurrentRaceTime: 0, LapNumber: 0, LastLap: 0, BestLap: 0, RacePosition: 0 };
        window.mediaRaceProgress = false;
        window.mediaFeed = setInterval(() => { window.mediaRaw.TimestampMS += 16; if (window.mediaRaceProgress) { window.mediaRaw.CurrentLap += .016; window.mediaRaw.CurrentRaceTime += .016; } window.dispatchEvent(new CustomEvent('telemetry', { detail: { ...window.mediaRaw } })); }, 16);
      }, raw);
      await media(track); await page.waitForTimeout(150); await settled(false); assert.equal(requests.length, 0, 'Both switches off must not start media polling');
      await configure({ lfaAutoExpand: true }); await settled(true, 'media');
      await frame.waitForFunction(() => !document.getElementById('lfaMediaArt').hidden);
      assert.equal(await frame.locator('#lfaMediaPosition').textContent(), '0:00'); await capture('playing');
      await media({ ...track, status: 'paused', position_seconds: 75 }); await page.waitForTimeout(3300); await settled(true, 'media');
      assert.equal(await frame.locator('#lfaMediaStatus').textContent(), 'PAUSED'); assert.ok(requests.length >= 2, 'GET health must sustain deduplicated paused metadata'); await capture('paused');
      await page.evaluate(() => { window.mediaRaceProgress = true; window.mediaRaw.CurrentLap = 1; window.mediaRaw.CurrentRaceTime = 1; window.mediaRaw.RacePosition = 3; });
      await settled(true, 'race'); await capture('race-priority', false);
      await page.evaluate(() => { window.mediaRaceProgress = false; window.mediaRaw.CurrentLap = 0; window.mediaRaw.CurrentRaceTime = 3; window.mediaRaw.RacePosition = 0; });
      await settled(true, 'media'); await capture('race-ended-media');
      await media(absent); await frame.waitForFunction(() => document.getElementById('lfaMediaStatus').textContent.startsWith('STALE /'));
      await capture('stale-grace'); await settled(false, 'telemetry');
      await configure({ lfaManualExpand: true, lfaAutoExpand: false }); await settled(true, 'telemetry');
      await media({ ...track, title: '很長的曲名・とても長い曲名 — <img src=x> '.repeat(8), artist: '藝術家／アーティスト '.repeat(12), album_title: 'Album 長い名前 '.repeat(15), thumbnail_available: false, thumbnail_url: null, duration_seconds: null, position_seconds: 12 });
      await settled(true, 'media'); assert.equal(await frame.locator('#lfaMediaDuration').textContent(), '—:—'); await capture('unicode-missing-duration');
      await media({ ...track, title: 'Old pending artwork', thumbnail_url: '/api/overlay/media/thumbnail?v=held' });
      await page.waitForTimeout(100);
      await media({ ...track, title: 'New track', thumbnail_url: '/api/overlay/media/thumbnail?v=red', position_seconds: 300 });
      await frame.waitForFunction(() => document.getElementById('lfaMediaArt').getAttribute('src')?.endsWith('v=red'));
      if (heldArt) { await heldArt.fulfill({ status: 200, contentType: 'image/svg+xml', body: artwork('#234f62') }); heldArt = null; }
      await page.waitForTimeout(100); assert.ok((await frame.locator('#lfaMediaArt').getAttribute('src')).endsWith('v=red'));
      assert.equal(await frame.locator('#lfaMediaPosition').textContent(), '5:00'); assert.equal(await frame.locator('#lfaMediaDuration').textContent(), '4:00'); await capture('new-art-and-reported-time');
      await media({ ...track, title: 'Decode failure fallback', thumbnail_url: '/api/overlay/media/thumbnail?v=broken' });
      await page.waitForTimeout(150); assert.equal(await frame.locator('#lfaMediaArtFallback').isVisible(), true); await capture('failed-art');
      await media(absent); await settled(true, 'telemetry'); await capture('manual-media-loss', false);
      await configure({ lfaManualExpand: false, lfaAutoExpand: false }); await settled(false);
      const stoppedRequests = requests.length; await page.waitForTimeout(1300); assert.equal(requests.length, stoppedRequests, 'Disabled media service must stop polling');
      assert.ok(requests.every(r => r.method === 'GET'));
      await frame.evaluate(() => window.postMessage({ type: 'hud:destroy' }, '*')); await page.waitForTimeout(80);
      const destroyedRequests = requests.length; await page.waitForTimeout(1100); assert.equal(requests.length, destroyedRequests); assert.deepEqual(errors, []);
      report.runs.push({ width, height, dpr, scale, samples, requests, errors, passed: true });
    } catch (error) {
      await page.screenshot({ path: path.join(out, `media-failure-${tag}.png`) }).catch(() => {});
      report.runs.push({ width, height, dpr, scale, samples, requests, errors, passed: false, error: String(error) }); throw error;
    } finally {
      if (heldArt) await heldArt.abort().catch(() => {});
      fs.writeFileSync(path.join(out, 'media-report.json'), JSON.stringify(report, null, 2));
      await context.close();
    }
  }
}
module.exports = { verifyMedia };
