type TokenType = 'num' | 'var' | 'op' | 'lparen' | 'rparen';
interface Token { type: TokenType, value: string }

const compileCache = new Map<string, (ctx: Record<string, number>) => number>();

/**
 * Safe Math Channel Evaluator for user-defined custom telemetry expressions.
 * Supports basic arithmetic (+, -, *, /), parentheses, numbers, and telemetry variable lookup.
 */
export function evaluateCustomMath(expression: string, context: Record<string, number>): number {
  if (!expression || !expression.trim()) return 0;

  const expr = expression.trim();
  let fn = compileCache.get(expr);

  if (!fn) {
    try {
      let sanitized = expr;

      // Alias mapping for user friendly variable names
      const aliases: Record<string, string> = {
        'Speed': 'SpeedMetersPerSecond',
        'RPM': 'CurrentEngineRpm',
        'Throttle': 'AccelInput',
        'Brake': 'BrakeInput',
        'LatG': 'AccelerationX',
        'LonG': 'AccelerationZ',
      };

      for (const [alias, realKey] of Object.entries(aliases)) {
        const regex = new RegExp(`\\b${alias}\\b`, 'g');
        sanitized = sanitized.replace(regex, realKey);
      }

      // Replace array index style references like TireTemp[0] -> TireTemp_0
      sanitized = sanitized.replace(/\[(\d+)\]/g, '_$1');

      // Security check: only allow numbers, math operators, and words that we will extract.
      let secCheck = sanitized.replace(/[a-zA-Z_][a-zA-Z0-9_]*/g, '1');
      if (/[^0-9\+\-\*\/\(\)\.\s]/.test(secCheck)) {
         fn = () => 0;
      } else {
          const tokens: Token[] = [];
          const regex = /([a-zA-Z_][a-zA-Z0-9_]*|\d+\.\d+|\d+|\+|-|\*|\/|\(|\))/g;
          let match;
          while ((match = regex.exec(sanitized)) !== null) {
              const val = match[1];
              if (/^[a-zA-Z_]/.test(val)) {
                  tokens.push({ type: 'var', value: val });
              } else if (/^\d/.test(val)) {
                  tokens.push({ type: 'num', value: val });
              } else if (['+', '-', '*', '/'].includes(val)) {
                  tokens.push({ type: 'op', value: val });
              } else if (val === '(') {
                  tokens.push({ type: 'lparen', value: val });
              } else if (val === ')') {
                  tokens.push({ type: 'rparen', value: val });
              }
          }

          const enhancedTokens: Token[] = [];
          let expectOperand = true;
          for (const token of tokens) {
              if (token.type === 'op' && expectOperand) {
                  if (token.value === '-') {
                      enhancedTokens.push({ type: 'num', value: '-1' });
                      enhancedTokens.push({ type: 'op', value: '*' });
                  } else if (token.value === '+') {
                      // Unary plus is a no-op, omit it
                      continue;
                  }
              } else {
                  enhancedTokens.push(token);
              }
              expectOperand = token.type === 'op' || token.type === 'lparen';
          }

          const precedence: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2 };
          const output: Token[] = [];
          const opStack: Token[] = [];
          let syntaxError = false;

          for (const t of enhancedTokens) {
              if (t.type === 'num' || t.type === 'var') {
                  output.push(t);
              } else if (t.type === 'lparen') {
                  opStack.push(t);
              } else if (t.type === 'rparen') {
                  let matched = false;
                  while (opStack.length > 0) {
                      const top = opStack.pop()!;
                      if (top.type === 'lparen') {
                          matched = true;
                          break;
                      }
                      output.push(top);
                  }
                  if (!matched) {
                      syntaxError = true;
                      break;
                  }
              } else if (t.type === 'op') {
                  while (opStack.length > 0 && opStack[opStack.length - 1].type === 'op' && precedence[opStack[opStack.length - 1].value] >= precedence[t.value]) {
                      output.push(opStack.pop()!);
                  }
                  opStack.push(t);
              }
          }
          while (opStack.length > 0) {
              const top = opStack.pop()!;
              if (top.type === 'lparen') {
                  syntaxError = true;
                  break;
              }
              output.push(top);
          }

          if (syntaxError) {
              fn = () => 0;
          } else {
              fn = (ctx: Record<string, number>) => {
                  const stack: number[] = [];
                  for (const t of output) {
                      if (t.type === 'num') {
                          stack.push(parseFloat(t.value));
                      } else if (t.type === 'var') {
                          stack.push(ctx[t.value] ?? 0);
                      } else if (t.type === 'op') {
                          const b = stack.pop() ?? 0;
                          const a = stack.pop() ?? 0;
                          if (t.value === '+') stack.push(a + b);
                          else if (t.value === '-') stack.push(a - b);
                          else if (t.value === '*') stack.push(a * b);
                          else if (t.value === '/') stack.push(b !== 0 ? a / b : 0);
                      }
                  }
                  return stack.pop() ?? 0;
              };
          }
      }

      compileCache.set(expr, fn);
    } catch {
      fn = () => 0;
      compileCache.set(expr, fn);
    }
  }

  try {
    const result = fn(context);
    return typeof result === 'number' && !isNaN(result) && isFinite(result) ? result : 0;
  } catch {
    return 0;
  }
}
