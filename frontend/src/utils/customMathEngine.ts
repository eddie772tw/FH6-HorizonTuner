/**
 * Safe Math Channel Evaluator for user-defined custom telemetry expressions.
 * Supports basic arithmetic (+, -, *, /), parentheses, numbers, and telemetry variable lookup.
 */
const compileCache = new Map<string, (ctx: Record<string, number>) => number>();

export function evaluateCustomMath(expression: string, context: Record<string, number>): number {
  if (!expression || !expression.trim()) return 0;

  try {
    let fn = compileCache.get(expression);
    if (!fn) {
      let sanitized = expression.trim();

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

      // Extract variables
      const variables = Array.from(new Set(sanitized.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || []));

      // Security check: ensure only expected characters and variables are present
      let testSanitized = sanitized;
      for (const v of variables) {
        testSanitized = testSanitized.replace(new RegExp(`\\b${v}\\b`, 'g'), '0');
      }

      if (/[^0-9\+\-\*\/\(\)\.\s]/.test(testSanitized)) {
        fn = () => 0;
      } else {
        const sortedVars = variables.sort((a, b) => b.length - a.length);
        let functionBodyExpr = sanitized;
        for (const v of sortedVars) {
          functionBodyExpr = functionBodyExpr.replace(new RegExp(`\\b${v}\\b`, 'g'), `(context['${v}'] ?? 0)`);
        }

        fn = new Function('context', `"use strict"; const result = (${functionBodyExpr}); return typeof result === 'number' && !isNaN(result) && isFinite(result) ? result : 0;`) as any;
      }

      if (fn) {
        compileCache.set(expression, fn);
      }
    }

    return fn!(context);
  } catch {
    return 0;
  }
}
