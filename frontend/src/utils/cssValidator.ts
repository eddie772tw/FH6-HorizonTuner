export interface CSSValidationResult {
  isValid: boolean;
  error?: string;
  errorLine?: number;
}

/**
  * Validates a CSS string for syntax errors such as unmatched braces,
  * broken comments, or unclosed string quotes.
  */
export function validateCSS(css: string): CSSValidationResult {
  if (!css || css.trim() === '') {
    return { isValid: true };
  }

  const lines = css.split('\n');
  let braceCount = 0;
  let inMultiLineComment = false;

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

      if (line[j] === '{') {
        braceCount++;
      } else if (line[j] === '}') {
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

  // DOM CSSStyleSheet validation if available
  if (typeof document !== 'undefined' && document.createElement) {
    try {
      const style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);
      const sheet = style.sheet as CSSStyleSheet | null;
      document.head.removeChild(style);
      if (!sheet) {
        return { isValid: false, error: 'Failed to create CSS stylesheet' };
      }
    } catch (e: any) {
      return { isValid: false, error: e.message || 'CSS Syntax Error' };
    }
  }

  return { isValid: true };
}
