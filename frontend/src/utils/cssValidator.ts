export interface CSSValidationResult {
  isValid: boolean;
  error?: string;
  errorLine?: number;
}

export const MAX_CUSTOM_CSS_BYTES = 64 * 1024; // 64 KiB

// Defense-in-depth: Disallow external imports, url() network probes, tag escapes, and dynamic execution
const DANGEROUS_CSS_PATTERNS = [
  { pattern: /<\/style/i, message: 'HTML style tag closing sequence </style> is forbidden' },
  { pattern: /@\s*import\b/i, message: '@import rules are forbidden in custom CSS' },
  { pattern: /@\s*(?:charset|namespace)\b/i, message: '@charset and @namespace rules are forbidden' },
  { pattern: /\b(?:url|image-set|image|src)\s*\(/i, message: 'External resource functions are forbidden in custom CSS' },
  { pattern: /\b(?:expression|behavior)\s*[:(]/i, message: 'Dynamic expressions and behaviors are forbidden' },
];

/**
 * Validates a CSS string for syntax errors and security risks.
 * Disallows external network resources, script execution, and oversized input.
 */
export function validateCSS(css: string): CSSValidationResult {
  if (css.length > MAX_CUSTOM_CSS_BYTES || new TextEncoder().encode(css).length > MAX_CUSTOM_CSS_BYTES) {
    return { isValid: false, error: 'Custom CSS exceeds the 64 KiB size limit' };
  }
  if (!css || css.trim() === '') {
    return { isValid: true };
  }

  const normalized = css.replace(/\r\n?|[\f]/g, '\n').replace(/\0/g, '\ufffd');
  if (/<\/style/i.test(normalized)) {
    return { isValid: false, error: 'HTML style tag closing sequence </style> is forbidden' };
  }

  const lines = normalized.split('\n');
  let braceCount = 0;
  let inMultiLineComment = false;
  let activeQuote: '"' | "'" | null = null;
  let stripped = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let j = 0;
    let escapedNewline = false;

    while (j < line.length) {
      if (inMultiLineComment) {
        if (line[j] === '*' && line[j + 1] === '/') {
          inMultiLineComment = false;
          // Emit a space so comment elision (e.g. `red/**/url(...)`) cannot merge tokens.
          stripped += ' ';
          j += 2;
          continue;
        }
        j++;
        continue;
      }

      const char = line[j];
      if (activeQuote !== null) {
        if (char === '\\') {
          if (j + 1 < line.length) {
            stripped += line.slice(j, j + 2);
            j += 2;
          } else {
            stripped += char;
            escapedNewline = true;
            j++;
          }
          continue;
        }
        stripped += char;
        if (char === activeQuote) activeQuote = null;
        j++;
        continue;
      }

      // Honor CSS escapes outside strings so `\/*` or `\"` cannot desynchronize lexer state.
      if (char === '\\' && j + 1 < line.length) {
        stripped += line.slice(j, j + 2);
        j += 2;
        continue;
      }

      if (char === '/' && line[j + 1] === '*') {
        inMultiLineComment = true;
        j += 2;
        continue;
      }

      if (char === '"' || char === "'") {
        activeQuote = char;
        stripped += char;
        j++;
        continue;
      }

      stripped += char;

      if (char === '{') {
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount < 0) {
          return {
            isValid: false,
            error: `Unexpected closing brace '}' at line ${i + 1}`,
            errorLine: i + 1,
          };
        }
      }
      j++;
    }
    if (activeQuote !== null && !escapedNewline) {
      return { isValid: false, error: `Unclosed string literal at line ${i + 1}`, errorLine: i + 1 };
    }
    stripped += '\n';
  }

  if (inMultiLineComment) {
    return {
      isValid: false,
      error: 'Unclosed comment /* ... */ at end of CSS',
    };
  }

  if (activeQuote !== null) {
    return { isValid: false, error: 'Unclosed string literal at end of CSS' };
  }

  if (braceCount > 0) {
    return {
      isValid: false,
      error: `Missing ${braceCount} closing brace '}' at end of CSS`,
    };
  }

  // CSS identifiers allow both hexadecimal and single-character escapes.
  const decoded = stripped.replace(/\\(?:([0-9a-f]{1,6})(?:\r\n|[ \t\r\n\f])?|(\r\n|[\r\n\f])|([\s\S]))/gi,
    (_match, hex: string | undefined, newline: string | undefined, char: string | undefined) => {
      if (hex) {
        const code = parseInt(hex, 16);
        return code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff) ? '\ufffd' : String.fromCodePoint(code);
      }
      return newline ? '' : char ?? '';
    });
  for (const { pattern, message } of DANGEROUS_CSS_PATTERNS) {
    if (pattern.test(decoded)) {
      return { isValid: false, error: message };
    }
  }

  // Pure syntax verification without DOM injection side-effects
  if (typeof CSSStyleSheet !== 'undefined' && typeof CSSStyleSheet.prototype.replaceSync === 'function') {
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
    } catch (e: any) {
      return { isValid: false, error: e.message || 'CSS Syntax Error' };
    }
  }

  return { isValid: true };
}
