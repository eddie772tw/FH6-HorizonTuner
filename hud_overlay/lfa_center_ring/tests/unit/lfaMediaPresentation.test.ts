import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
const directory = resolve(process.cwd(), '../hud_overlay/lfa_center_ring');
const scope: any = {};
for (const file of ['lfa-expansion.js', 'lfa-media-renderer.js']) runInNewContext(readFileSync(resolve(directory, file), 'utf8'), scope);
const policy = scope.LfaExpansion.layoutPolicy;
const track = { available: true, freshness: 'live', title: 'Track', artist: 'Artist', album: 'Album', status: 'playing', position: 0, duration: 240, progress: 0, artUrl: null };
function renderer() {
  const nodes: Record<string, any> = {}, images: any[] = [];
  const Image = class { onload: any; onerror: any; naturalWidth = 64; naturalHeight = 64; src = ''; constructor() { images.push(this); } };
  const window: any = { Image };
  runInNewContext(readFileSync(resolve(directory, 'lfa-media-renderer.js'), 'utf8'), { window });
  const ui = window.LfaMediaRenderer.create({ getElementById: (id: string) => nodes[id] ||= { textContent: '', hidden: false, style: {}, dataset: {}, removeAttribute(name: string) { delete this[name]; } } });
  return { ui, images, nodes };
}
describe('LFA race/media expansion policy', () => {
  it('implements all manual/auto combinations with race above media above telemetry', () => {
    for (const manual of [false, true]) for (const auto of [false, true]) for (const race of [false, true]) for (const media of [false, true]) {
      const result = policy({ lfaManualExpand: manual, lfaAutoExpand: auto }, race, media);
      expect(result.expanded).toBe(manual || (auto && (race || media)));
      expect(result.page).toBe(race ? 'race' : media ? 'media' : 'telemetry');
    }
  });
  it('returns to live media after a race, then collapses after media loss unless manually held', () => {
    const auto = { lfaAutoExpand: true };
    expect([policy(auto, false, true).page, policy(auto, true, true).page, policy(auto, false, true).page]).toEqual(['media', 'race', 'media']);
    expect(policy(auto, false, false)).toEqual({ expanded: false, page: 'telemetry' });
    expect(policy({ ...auto, lfaManualExpand: true }, false, false)).toEqual({ expanded: true, page: 'telemetry' });
    expect(policy({ lfaAutoExpand: false }, false, true).expanded).toBe(false);
  });
});
describe('LFA bounded read-only media presentation', () => {
  it('formats actual reported time including zero and bounds extraordinary durations', () => {
    for (const [value, text] of [[0, '0:00'], [61.9, '1:01'], [3601, '1:00:01'], [359999, '99:59:59']]) expect(scope.LfaMediaRenderer.formatTime(value)).toBe(text);
    for (const value of [null, undefined, NaN, Infinity, -1, 360000]) expect(scope.LfaMediaRenderer.formatTime(value)).toBe('—:—');
  });
  it('projects plain metadata, valid zero progress and missing time without inventing values', () => {
    const { ui, nodes } = renderer();
    ui.render({ ...track, title: '<img src=x onerror=alert(1)>', artist: '音樂家', duration: null, progress: null }, true);
    expect(nodes.lfaMediaTitle.textContent).toBe('<img src=x onerror=alert(1)>'); expect(nodes.lfaMediaArtist.textContent).toBe('音樂家');
    expect(nodes.lfaMediaPosition.textContent).toBe('0:00'); expect(nodes.lfaMediaDuration.textContent).toBe('—:—'); expect(nodes.lfaMediaProgress.style.visibility).toBe('hidden');
    ui.render(track, true); expect(nodes.lfaMediaProgress.style.visibility).toBe(''); expect(nodes.lfaMediaProgress.style.strokeDasharray).toBe('0 100');
    ui.render({ ...track, position: 300, duration: 240, progress: 1.25 }, true);
    expect(nodes.lfaMediaPosition.textContent).toBe('5:00'); expect(nodes.lfaMediaDuration.textContent).toBe('4:00'); expect(nodes.lfaMediaProgress.style.strokeDasharray).toBe('100 100');
  });
  it('makes cached stale media visibly distinct from live playback', () => {
    const { ui, nodes } = renderer(); ui.render({ ...track, freshness: 'stale', status: 'paused' }, true);
    expect(nodes.lfaMediaStatus.textContent).toBe('STALE / PAUSED'); expect(nodes.lfaMediaStatus.dataset.stale).toBe('true');
    ui.render(track, true); expect(nodes.lfaMediaStatus.textContent).toBe('PLAYING'); expect(nodes.lfaMediaStatus.dataset.stale).toBe('false');
  });
  it('fences late previous-track artwork and restores the fallback on decode failure', () => {
    const { ui, images, nodes } = renderer();
    ui.render({ ...track, artUrl: '/api/overlay/media/thumbnail?v=a' }, true); const late = images[0].onload;
    ui.render({ ...track, title: 'Next', artUrl: '/api/overlay/media/thumbnail?v=b' }, true);
    late(); expect(nodes.lfaMediaArt.hidden).toBe(true);
    images[1].onload(); expect(nodes.lfaMediaArt.src).toBe('/api/overlay/media/thumbnail?v=b'); expect(nodes.lfaMediaArtFallback.hidden).toBe(true);
    nodes.lfaMediaArt.onerror(); expect(nodes.lfaMediaArt.hidden).toBe(true); expect(nodes.lfaMediaArtFallback.hidden).toBe(false);
    ui.render({ ...track, title: 'Broken', artUrl: '/api/overlay/media/thumbnail?v=bad' }, true); images[2].onerror(); expect(nodes.lfaMediaArt.hidden).toBe(true);
  });
  it('drops pending artwork when race content takes over and after destroy', () => {
    const { ui, images, nodes } = renderer();
    ui.render({ ...track, artUrl: '/api/overlay/media/thumbnail?v=a' }, true); const late = images[0].onload;
    ui.render(track, false); late(); expect(nodes.lfaMediaArt.hidden).toBe(true);
    ui.render({ ...track, artUrl: '/api/overlay/media/thumbnail?v=b' }, true); const afterDestroy = images[1].onload;
    ui.destroy(); afterDestroy(); expect(nodes.lfaMediaArt.hidden).toBe(true); expect(nodes.lfaMediaArt.src).toBeUndefined();
  });
});
