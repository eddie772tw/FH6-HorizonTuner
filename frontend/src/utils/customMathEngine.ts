/**
 * Safe Math Channel Evaluator for user-defined custom telemetry expressions.
 * Supports basic arithmetic (+, -, *, /), parentheses, numbers, and telemetry variable lookup.
 */
const compileCache = new Map<string, (ctx: Record<string, number>) => number>();

export function evaluateCustomMath(expression: string, context: Record<string, number>): number {
  if (!expression || !expression.trim()) return 0;

  const expr = expression.trim();
  let compiled = compileCache.get(expr);

  if (!compiled) {
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

      // Now extract all valid identifiers (letters, numbers, underscores)
      const identifiers = Array.from(new Set(sanitized.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || []));

      // Validation: Replace these identifiers with '0' and check for malicious chars
      let validationStr = sanitized;
      for (const id of identifiers) {
        const regex = new RegExp(`\\b${id}\\b`, 'g');
        validationStr = validationStr.replace(regex, '0');
      }

      // Security check: strictly allow only numbers, operators, dots, space, and math functions
      if (/[^0-9\+\-\*\/\(\)\.\s]/.test(validationStr)) {
        // Unresolved identifiers present, fallback to 0
        compiled = () => 0;
      } else {
        // Rewrite the expression to use ctx.
        let executableStr = sanitized;
        // Sort keys by length descending to prevent partial key substitution
        identifiers.sort((a, b) => b.length - a.length);
        for (const id of identifiers) {
          const regex = new RegExp(`\\b${id}\\b`, 'g');
          executableStr = executableStr.replace(regex, `(ctx['${id}'] ?? 0)`);
        }

        // Safely evaluate simple arithmetic using Function constructor with restricted scope
        // eslint-disable-next-line no-new-func
        compiled = new Function("ctx", `"use strict"; return (${executableStr});`) as (ctx: Record<string, number>) => number;
      }
    } catch {
      compiled = () => 0;
    }
    compileCache.set(expr, compiled);
  }

  try {
    const result = compiled(context);
    return typeof result === 'number' && !isNaN(result) && isFinite(result) ? result : 0;
  } catch {
    return 0;
  }
}
