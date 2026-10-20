import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeBrandFragment } from '../../assets/normalize-brand-fragment.mjs';

const assets = resolve(import.meta.dirname, '../../assets');
const geometry = '<path d="M0 0L1 1" fill="none"/>';
const originalFragments = {
  alpine: '8f0272c2dd2967b0dd47b7a5dccd7f346e69a09ea14627a08e792ff97508997d',
  pioneer: '3aa7dd8b80f38e64eb9c9a4763125f5e4533305d9eaabf4f7a2092be10ab404f',
  pioneer_1969: '502d9981f86bda06b0f6fd40ffc11aa785ce7fec4d86b7c076a961cd50291dc5',
  sony: 'eef42fba689050facb4c39f7a67713aab7e6aab6fdfbea89367d5741aa6b1324',
  kenwood: '1f19a1bb7997eb8a6a65c5ea1ef414359fc4ce9c95a70b8ff29319ec6263fd92',
  cdda: 'b011596ff04542097913c1a17259c9b85b43c4e2f4f94b867ef84839834ddd6a',
};
// Hash the canonical pre-fix bytes, independent of Windows checkout newline conversion.
const originalPanels = {
  "alpine_7848.svg": "d2a8e1498282abbceb2c4777e78cf7add28ecaec45f1365a7c6b3b297b9b9e2b",
  "alpine_9815.svg": "bd4f324b9b23030413266b05e71a906cf999423d126239ea667890e77f61c9e0",
  "jvc_kameleon.svg": "b2ac4a6219af2198fbfb056d139c5508c3e3a59aef05428b52580b2fc28a2db0",
  "kenwood_krc.svg": "63e10e0e000f64e392b3b8e03bfadd05dd7b6fb0220980995698b339d4459e58",
  "panasonic.svg": "e0b6f11a53d86783dfe094a636b45da2ecee35af33d4da5780448fd7310d0e42",
  "pioneer.svg": "f7900d2f2a022fbbd55971fa928a0f0a2e476e1c73278bcdd0dfdbaa5ccce940",
  "pioneer_dexp1r.svg": "13ed73d90dd80a25055df7a375589e47e3b5a79925a543c688e5ba963634c13b",
  "pioneer_p835r.svg": "8c562cc6aa6851b3e02ef0816ac57f8bd9c8d1845f3963b14154e334a5b5b184",
  "sony_cdx.svg": "770fbdf106d15f7296af26f2367cf348bb52f496ab7347faa4cee5cd798df032"
};
const panels = Object.keys(originalPanels);

function temporaryGenerator(run: (directory: string) => void) {
  const directory = mkdtempSync(join(tmpdir(), 'fh6-brand-normalization-'));
  try {
    for (const name of ['build-panels.mjs', 'normalize-brand-fragment.mjs', 'panel-glyphs.json', 'brands']) {
      cpSync(join(assets, name), join(directory, name), { recursive: true });
    }
    run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe('bounded brand-fragment normalization', () => {
  it.each([
    '<sty<!--x-->le>bad</style>',
    '<sty<style>x</style>le>bad</style>',
    '<!<!--x-->--evil-->',
    '<sty class="discard"le>bad</style>',
    '<sty fill="#fff"le>bad</style>',
    '<STyLE>bad</sTyLe>',
    '<!--bad--!>',
    '<sty<!--bad--!>le>bad</style>',
    '<!<!--x--!>--evil--!>',
    '<styfill:#fff;le>bad</style>',
    '<style><style>x</style></style>',
    '<style data-label=">">x</style>',
    '<!--first--!><!--second-->',
    '<style>x</style><title>y</title><!--z--><metadata>m</metadata>',
    '<metadata><title>nested</title></metadata>',
    '<style>x</style\t\n>',
  ])('fully removes reformed or removable markup: %s', fragment => {
    expect(normalizeBrandFragment(fragment + geometry)).toBe(geometry);
  });

  it.each([
    '<!--unfinished', '<!-', '-->', '<style>', '<style', '</style>',
    '<style>x</title>', '<title>x</metadata>', '<STyLE>x</TITLE>',
    '<metadata>missing close',
    '<sty', '<title>x</title attribute>', '<style/>',
    '--!>', '<!--unfinished--!', '<!-', '<style>x</metadata>',
    '<sty<!--x-->le>unfinished', '<sty id="x"le>unfinished',
    '<title data-label="unfinished>x</title>',
  ])('fails closed on unresolved markup: %s', fragment => {
    expect(() => normalizeBrandFragment(fragment)).toThrow(/Unresolved/);
  });

  it('uses the earliest comment ending and preserves intervening geometry', () => {
    expect(normalizeBrandFragment('<!--first--!>' + geometry + '<!--second-->')).toBe(geometry);
    expect(() => normalizeBrandFragment('<!--first--!>' + geometry + '-->')).toThrow(/Unresolved/);
  });

  it('preserves geometry when the ordinary comment ending precedes the alternate ending', () => {
    expect(normalizeBrandFragment('<!--first-->' + geometry + '<!--second--!>')).toBe(geometry);
    expect(() => normalizeBrandFragment('<!--first-->' + geometry + '--!>')).toThrow(/Unresolved/);
  });

  it('keeps greater-than signs inside single-quoted attributes within the tag', () => {
    expect(normalizeBrandFragment("<style data-label='> <title>'>discard</style>" + geometry)).toBe(geometry);
  });

  it('preserves geometry, fill=none, non-fill styles and internal whitespace', () => {
    const input = '  <path id="p" class="ink" fill="none" style="fill:#abc;fill-opacity:1;stroke:none" d="M0 0 L1 1"/>  \n';
    expect(normalizeBrandFragment(input)).toBe('  <path fill="none" style="fill-opacity:1;stroke:none" d="M0 0 L1 1"/>\n');
    expect(normalizeBrandFragment(geometry)).toBe(geometry);
  });

  it('bounds oversized inputs and excessive delimiter reformation', () => {
    expect(() => normalizeBrandFragment('x'.repeat(65537))).toThrow(/65536/);
    expect(() => normalizeBrandFragment(null)).toThrow(/string/);
    let nested = '<style>x</style>';
    for (let i = 0; i < 40; i++) nested = '<sty' + nested + 'le>x</style>';
    expect(() => normalizeBrandFragment(nested)).toThrow(/converge/);
  });

  it('preserves all six pre-fix normalized fragment bytes, including Alpine and CDDA', () => {
    // Execute the generator's actual loading/selection path with the production helper.
    const source = readFileSync(join(assets, 'build-panels.mjs'), 'utf8');
    const load = new Function('readFileSync', 'out', 'normalizeBrandFragment',
      source.slice(source.indexOf('const glyphs'), source.indexOf('const n =')) + '\nreturn brands;');
    const brands = load(readFileSync, assets + '/', normalizeBrandFragment);
    expect(Object.keys(brands)).toEqual(Object.keys(originalFragments));
    for (const [name, hash] of Object.entries(originalFragments)) {
      expect(createHash('sha256').update(brands[name].body).digest('hex'), name).toBe(hash);
      expect(normalizeBrandFragment(brands[name].body), name).toBe(brands[name].body);
    }
  });

  it('generates all nine panels with exactly the pre-fix bytes, without CRLF normalization', () => {
    expect(panels).toHaveLength(9);
    temporaryGenerator(directory => {
      execFileSync(process.execPath, [join(directory, 'build-panels.mjs')], { timeout: 3000 });
      for (const [name, hash] of Object.entries(originalPanels)) {
        expect(createHash('sha256').update(readFileSync(join(directory, name))).digest('hex'), name).toBe(hash);
      }
    });
  });

  it('rejects a malformed final brand before writing any panel', () => {
    temporaryGenerator(directory => {
      for (const name of panels) writeFileSync(join(directory, name), 'unchanged ' + name);
      const path = join(directory, 'brands/cdda.svg');
      writeFileSync(path, readFileSync(path, 'utf8').replace('</svg>', '<sty<!--x-->le>unfinished</svg>'));
      const result = spawnSync(process.execPath, [join(directory, 'build-panels.mjs')], { encoding: 'utf8', timeout: 3000 });
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Unresolved forbidden');
      for (const name of panels) expect(readFileSync(join(directory, name), 'utf8')).toBe('unchanged ' + name);
    });
  });
});
