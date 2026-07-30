/**
 * Utility functions for VFD audio spectrum frequency bin grouping,
 * peak hold decay physics, and system media marquee text formatting.
 */

export interface SpectrumBinConfig {
  sampleRate?: number;
  fftSize?: number;
  bandCount?: number;
  minFreq?: number;
  maxFreq?: number;
}

export interface PeakHoldState {
  values: number[];
  holdTicks: number[];
}

/**
 * Group linear FFT frequency byte array (0..255) into logarithmic frequency bands.
 */
export function groupFrequencyBins(
  freqByteData: Uint8Array | number[],
  bandCount: number = 32
): number[] {
  if (!freqByteData || freqByteData.length === 0) {
    return new Array(bandCount).fill(0);
  }

  const result: number[] = new Array(bandCount).fill(0);
  const dataLen = freqByteData.length;

  for (let b = 0; b < bandCount; b++) {
    // Logarithmic index mapping from 0..bandCount-1 to 0..dataLen-1
    const startRatio = Math.pow(b / bandCount, 2.0);
    const endRatio = Math.pow((b + 1) / bandCount, 2.0);

    const startIdx = Math.floor(startRatio * dataLen);
    const endIdx = Math.min(dataLen - 1, Math.floor(endRatio * dataLen));

    let sum = 0;
    let count = 0;

    for (let i = startIdx; i <= endIdx; i++) {
      sum += freqByteData[i] || 0;
      count++;
    }

    const avgByte = count > 0 ? sum / count : 0;
    // Normalize 0..255 to 0.0..1.0
    result[b] = Math.min(1.0, Math.max(0.0, avgByte / 255.0));
  }

  return result;
}

/**
 * Update peak hold values with gravitational decay logic.
 */
export function updatePeakHold(
  currentBands: number[],
  prevState: PeakHoldState | null,
  holdDurationTicks: number = 10,
  decayStep: number = 0.04
): PeakHoldState {
  const bandCount = currentBands.length;

  if (!prevState || prevState.values.length !== bandCount) {
    return {
      values: [...currentBands],
      holdTicks: currentBands.map((v) => (v > 0 ? holdDurationTicks : 0)),
    };
  }

  const newValues = new Array(bandCount).fill(0);
  const newHoldTicks = new Array(bandCount).fill(0);

  for (let i = 0; i < bandCount; i++) {
    const cur = currentBands[i];
    const prevVal = prevState.values[i];
    const prevHold = prevState.holdTicks[i];

    if (cur >= prevVal) {
      newValues[i] = cur;
      newHoldTicks[i] = cur > 0 ? holdDurationTicks : 0;
    } else {
      if (prevHold > 0) {
        newValues[i] = prevVal;
        newHoldTicks[i] = prevHold - 1;
      } else {
        newValues[i] = Math.max(cur, prevVal - decayStep);
        newHoldTicks[i] = 0;
      }
    }
  }

  return {
    values: newValues,
    holdTicks: newHoldTicks,
  };
}

/**
 * Sanitize text to ensure compatibility with 14-segment VFD font display.
 * Replaces unsupported symbols like '&' with 'AND', normalizes accents and punctuation,
 * and strips/replaces unrenderable non-ASCII characters.
 */
export function sanitizeVFDText(text?: unknown): string {
  if (text === null || text === undefined) return '';
  let str = typeof text === 'string' ? text : String(text);
  if (!str.trim()) return '';

  // 1. Normalize unicode accents and smart punctuation
  str = str
    .replace(/[éèêë]/gi, 'E')
    .replace(/[áàâäã]/gi, 'A')
    .replace(/[óòôöõ]/gi, 'O')
    .replace(/[úùûü]/gi, 'U')
    .replace(/[íìîï]/gi, 'I')
    .replace(/ñ/gi, 'N')
    .replace(/ç/gi, 'C')
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...');

  // 2. Replace '&' with 'AND', remove exclamation marks
  str = str.replace(/&/g, 'AND').replace(/!/g, '');

  // 3. Remove unsupported non-ASCII / CJK / Emoji characters
  str = str.replace(/[^\x20-\x7E]/g, ' ');

  // 4. Clean up punctuation, normalize spaces and uppercase
  return str
    .replace(/[@#$%\^*()_+=[\]{}|\\;:'",.<>?]/g, ' ')
    .replace(/\s+/g, ' ')
    .toUpperCase()
    .trim();
}

/**
 * Format media track title & artist into a 14-segment VFD marquee text string.
 */
export function formatMediaMarquee(
  title?: unknown,
  artist?: unknown,
  maxLength: number = 96
): string {
  const cleanTitle = sanitizeVFDText(title);
  const cleanArtist = sanitizeVFDText(artist);

  if (!cleanTitle && !cleanArtist) {
    return 'TANTRON - TURBO FIRE /// MADE BY CROSXOVER';
  }

  let formatted = '';
  if (cleanArtist && cleanTitle) {
    formatted = `${cleanArtist} - ${cleanTitle}`;
  } else {
    formatted = cleanTitle || cleanArtist;
  }

  const sanitized = formatted;
  if (sanitized.length > maxLength) {
    return sanitized.substring(0, maxLength);
  }
  return sanitized;
}

