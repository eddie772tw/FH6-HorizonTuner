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
         // Replace words with context lookups
         let code = sanitized.replace(/[a-zA-Z_][a-zA-Z0-9_]*/g, (match) => {
             return `(context['${match}'] ?? 0)`;
         });
         fn = new Function('context', `"use strict"; return (${code});`) as (ctx: Record<string, number>) => number;
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
