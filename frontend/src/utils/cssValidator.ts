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
  { pattern: /@(?:charset|namespace)\b/i, message: '@charset and @namespace rules are forbidden' },
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

  const lines = css.split('\n');
  let braceCount = 0;
  let inMultiLineComment = false;
  let stripped = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let j = 0;

    while (j < line.length) {
      if (inMultiLineComment) {
        if (line[j] === '*' && line[j + 1] === '/') {
          inMultiLineComment = false;
          j += 2;
          continue;
        }
        j++;
        continue;
      }

      if (line[j] === '/' && line[j + 1] === '*') {
        inMultiLineComment = true;
        j += 2;
        continue;
      }

      const char = line[j];
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
    stripped += '\n';
  }

  if (inMultiLineComment) {
    return {
      isValid: false,
      error: 'Unclosed comment /* ... */ at end of CSS',
    };
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
