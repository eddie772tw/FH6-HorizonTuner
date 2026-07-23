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
});
