/**
 * Safe Math Channel Evaluator for user-defined custom telemetry expressions.
 * Supports basic arithmetic (+, -, *, /), parentheses, numbers, and telemetry variable lookup.
 */
export function evaluateCustomMath(expression: string, context: Record<string, number>): number {
  if (!expression || !expression.trim()) return 0;

  try {
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

    // Replace known context variable keys with their numerical values
    // Sort keys by length descending to prevent partial key substitution
    const sortedKeys = Object.keys(context).sort((a, b) => b.length - a.length);

    for (const key of sortedKeys) {
      const val = context[key] ?? 0;
      const regex = new RegExp(`\\b${key}\\b`, 'g');
      sanitized = sanitized.replace(regex, String(val));
    }

    // Replace array index style references like TireTemp[0] -> TireTemp_0
    sanitized = sanitized.replace(/\[(\d+)\]/g, '_$1');

    // Security check: strictly allow only numbers, operators, dots, space, and math functions
    if (/[^0-9\+\-\*\/\(\)\.\s]/.test(sanitized)) {
      // Unresolved identifiers present, fallback to 0
      return 0;
    }

    // Safely evaluate simple arithmetic using Function constructor with restricted scope
    const result = new Function(`"use strict"; return (${sanitized});`)();
    return typeof result === 'number' && !isNaN(result) && isFinite(result) ? result : 0;
  } catch {
    return 0;
  }
}
