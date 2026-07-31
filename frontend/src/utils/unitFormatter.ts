/**
 * Utility functions for consistent unit formatting across the application.
 */

/**
 * Formats a numeric value with the degree symbol (\u00B0) and optional temperature unit ('C' | 'F').
 * Ensures degree symbols are consistently rendered as Unicode '\u00B0' instead of localized text.
 */
export function formatDegree(value: number | string, unit: 'C' | 'F' | '' = ''): string {
  const formattedVal = typeof value === 'number' ? (Number.isInteger(value) ? value.toString() : value.toString()) : value;
  if (!unit) {
    return `${formattedVal}\u00B0`;
  }
  return `${formattedVal}\u00B0${unit}`;
}
