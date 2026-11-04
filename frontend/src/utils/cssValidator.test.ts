import { describe, it, expect, vi } from 'vitest';
import { validateCSS } from './cssValidator';

describe('cssValidator', () => {
  it('returns valid for empty or whitespace CSS', () => {
    expect(validateCSS('')).toEqual({ isValid: true });
    expect(validateCSS('   \n  ')).toEqual({ isValid: true });
  });

  it('returns valid for well-formed CSS rules', () => {
    const validCSS = `
      .glass-panel {
        background: rgba(0, 0, 0, 0.5);
        border-radius: 12px;
      }
      :root {
        --primary: #00f0ff;
      }
    `;
    expect(validateCSS(validCSS)).toEqual({ isValid: true });
  });

  it('detects unexpected closing brace', () => {
    const invalidCSS = `
      .glass-panel {
        background: red;
      }}
    `;
    const res = validateCSS(invalidCSS);
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('Unexpected closing brace');
  });

  it('detects missing closing brace', () => {
    const invalidCSS = `
      .glass-panel {
        background: red;
    `;
    const res = validateCSS(invalidCSS);
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('Missing 1 closing brace');
  });

  it('detects unclosed comment', () => {
    const invalidCSS = `
      /* Unclosed comment
      .glass-panel { color: red; }
    `;
    const res = validateCSS(invalidCSS);
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('Unclosed comment');
  });

  it('blocks dangerous external imports, URLs, and script expressions', () => {
    expect(validateCSS('@import url("https://evil.com/leak.css");').isValid).toBe(false);
    expect(validateCSS('@/*comment*/import "malicious.css";').isValid).toBe(false);
    expect(validateCSS('.card { background: url(https://evil.com/probe.png); }').isValid).toBe(false);
    expect(validateCSS('.card { background: url("data:image/svg+xml,<svg></svg>"); }').isValid).toBe(false);
    expect(validateCSS('</style><script>alert(1)</script>').isValid).toBe(false);
    expect(validateCSS('.card { width: expression(alert(1)); }').isValid).toBe(false);
    expect(validateCSS('@charset "UTF-8";').isValid).toBe(false);
  });

  it('allows safe comments mentioning forbidden keywords without false positives', () => {
    const safeWithComment = `
      /* @import is forbidden, use custom variables instead */
      .glass-panel {
        background: rgba(0, 0, 0, 0.5);
      }
    `;
    expect(validateCSS(safeWithComment)).toEqual({ isValid: true });
  });

  it.each([
    String.raw`@\69mport "https://example.invalid/theme.css";`,
    String.raw`.card { background: u\72l("https://example.invalid/probe"); }`,
    '.card { background: image-set("https://example.invalid/probe" 1x); }',
    String.raw`.card { background: -webkit-\69mage-set("https://example.invalid/probe" 1x); }`,
  ])('rejects escaped keywords and string-based image resources: %s', css => {
    expect(validateCSS(css).isValid).toBe(false);
  });

  it('does not insert styles when constructable stylesheets are unavailable', () => {
    vi.stubGlobal('CSSStyleSheet', undefined);
    vi.stubGlobal('document', { createElement: () => { throw new Error('DOM injection attempted'); } });
    try {
      expect(validateCSS('.card { color: red; }')).toEqual({ isValid: true });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects oversized CSS exceeding the 64 KiB boundary', () => {
    const largeCSS = '.card { color: red; }\n'.repeat(3000); // > 64 KiB
    const res = validateCSS(largeCSS);
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('64 KiB size limit');
  });
});
