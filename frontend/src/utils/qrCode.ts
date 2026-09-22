/**
 * Lightweight, zero-dependency QR Code (Model 2) SVG generator.
 * Supports Byte mode (UTF-8/ASCII) up to Version 6 with Error Correction Level M.
 */

// Galois Field GF(256) with primitive polynomial 0x11d
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_EXP[i + 255] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
})();

function gfMul(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return GF_EXP[GF_LOG[x] + GF_LOG[y]];
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], GF_EXP[i]);
      next[j + 1] ^= poly[j];
    }
    poly = next;
  }
  return poly;
}

function rsCalculateEc(data: Uint8Array, ecLength: number): Uint8Array {
  const gen = rsGeneratorPoly(ecLength);
  const result = new Uint8Array(ecLength);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ result[0];
    result.copyWithin(0, 1);
    result[ecLength - 1] = 0;
    for (let j = 0; j < ecLength; j++) {
      result[j] ^= gfMul(gen[j], factor);
    }
  }
  return result;
}

// Version table: [version, totalCodewords, ecCodewordsPerBlock, numBlocks] for Level M
const VERSION_TABLE = [
  { version: 1, total: 26, ec: 10, blocks: 1, size: 21 },
  { version: 2, total: 44, ec: 16, blocks: 1, size: 25 },
  { version: 3, total: 70, ec: 26, blocks: 1, size: 29 },
  { version: 4, total: 100, ec: 18, blocks: 2, size: 33 },
  { version: 5, total: 134, ec: 24, blocks: 2, size: 37 },
  { version: 6, total: 172, ec: 16, blocks: 4, size: 41 },
];

export function generateQrMatrix(text: string): boolean[][] {
  const textBytes = new TextEncoder().encode(text);
  const dataLen = textBytes.length;

  // Find minimum version that fits data
  let verInfo = VERSION_TABLE[0];
  let found = false;
  for (const info of VERSION_TABLE) {
    const dataCapacity = info.total - info.ec * info.blocks;
    if (dataLen + 3 <= dataCapacity) { // 3 bytes for mode + length header + terminator
      verInfo = info;
      found = true;
      break;
    }
  }
  if (!found) {
    verInfo = VERSION_TABLE[VERSION_TABLE.length - 1];
  }

  const { version, total, ec, blocks, size } = verInfo;
  const dataCapacity = total - ec * blocks;

  // Encode data in Byte mode (0100)
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };

  pushBits(0b0100, 4); // Byte mode
  pushBits(dataLen, 8); // Character count
  for (const b of textBytes) pushBits(b, 8);
  // Terminator
  pushBits(0b0000, Math.min(4, dataCapacity * 8 - bits.length));
  // Pad to byte
  while (bits.length % 8 !== 0) bits.push(0);
  // Pad bytes
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bits.length < dataCapacity * 8) {
    pushBits(padBytes[padIdx % 2], 8);
    padIdx++;
  }

  const dataCodewords = new Uint8Array(dataCapacity);
  for (let i = 0; i < dataCapacity; i++) {
    let byte = 0;
    for (let b = 0; b < 8; b++) byte = (byte << 1) | bits[i * 8 + b];
    dataCodewords[i] = byte;
  }

  // Interleave and calculate EC
  const blockSize = Math.floor(dataCapacity / blocks);
  const rawCodewords: Uint8Array[] = [];
  const ecCodewords: Uint8Array[] = [];

  for (let i = 0; i < blocks; i++) {
    const blockData = dataCodewords.slice(i * blockSize, (i + 1) * blockSize);
    rawCodewords.push(blockData);
    ecCodewords.push(rsCalculateEc(blockData, ec));
  }

  const finalCodewords: number[] = [];
  for (let i = 0; i < blockSize; i++) {
    for (let b = 0; b < blocks; b++) finalCodewords.push(rawCodewords[b][i]);
  }
  for (let i = 0; i < ec; i++) {
    for (let b = 0; b < blocks; b++) finalCodewords.push(ecCodewords[b][i]);
  }

  // Initialize Matrix
  const matrix: (number | null)[][] = Array.from({ length: size }, () => Array(size).fill(null));
  const isFunction: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  const setModule = (r: number, c: number, val: boolean, fn = true) => {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      matrix[r][c] = val ? 1 : 0;
      if (fn) isFunction[r][c] = true;
    }
  };

  // 1. Finder patterns
  const drawFinder = (row: number, col: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        if (r >= 0 && r < 7 && c >= 0 && c < 7) {
          const isBlack = r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4);
          setModule(row + r, col + c, isBlack);
        } else {
          setModule(row + r, col + c, false); // Separator
        }
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // 2. Timing patterns
  for (let i = 8; i < size - 8; i++) {
    setModule(6, i, i % 2 === 0);
    setModule(i, 6, i % 2 === 0);
  }

  // 3. Alignment patterns (version >= 2)
  if (version >= 2) {
    const alignPos = size - 7;
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) {
        const isBlack = Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0);
        setModule(alignPos + r, alignPos + c, isBlack);
      }
    }
  }

  // 4. Reserve format info
  for (let i = 0; i < 9; i++) {
    setModule(8, i, false);
    setModule(i, 8, false);
  }
  for (let i = size - 8; i < size; i++) {
    setModule(8, i, false);
    setModule(i, 8, false);
  }
  setModule(size - 8, 8, true); // Dark module

  // 5. Fill data bits (with mask 0: (r + c) % 2 === 0)
  let bitIdx = 0;
  const allBits: number[] = [];
  for (const byte of finalCodewords) {
    for (let b = 7; b >= 0; b--) allBits.push((byte >> b) & 1);
  }

  let upward = true;
  for (let c = size - 1; c > 0; c -= 2) {
    if (c === 6) c--; // Skip timing column
    const rows = upward
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (const r of rows) {
      for (const colOffset of [0, -1]) {
        const col = c + colOffset;
        if (!isFunction[r][col]) {
          const bit = bitIdx < allBits.length ? allBits[bitIdx++] : 0;
          const mask = (r + col) % 2 === 0;
          matrix[r][col] = (bit ^ (mask ? 1 : 0)) ? 1 : 0;
        }
      }
    }
    upward = !upward;
  }

  // 6. Format info for Level M, Mask 0: 0x5412 ^ 0x5412 = 0, BCH encoded: 0b101010000010010
  const FORMAT_BITS = [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0];
  for (let i = 0; i < 15; i++) {
    const bit = FORMAT_BITS[i] === 1;
    // Top-left
    if (i <= 5) setModule(8, i, bit);
    else if (i === 6) setModule(8, 7, bit);
    else if (i <= 8) setModule(8, 8, bit);
    else setModule(14 - i, 8, bit);

    // Split around corners
    if (i < 8) setModule(size - 1 - i, 8, bit);
    else setModule(8, size - 15 + i, bit);
  }

  return matrix.map(row => row.map(val => val === 1));
}

export function generateQrSvg(text: string, pixelSize = 240): string {
  const matrix = generateQrMatrix(text);
  const count = matrix.length;
  const cellSize = pixelSize / count;

  let rects = '';
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (matrix[r][c]) {
        rects += `<rect x="${(c * cellSize).toFixed(2)}" y="${(r * cellSize).toFixed(2)}" width="${cellSize.toFixed(2)}" height="${cellSize.toFixed(2)}" fill="#000"/>`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pixelSize} ${pixelSize}" width="${pixelSize}" height="${pixelSize}" style="background:#fff;border-radius:8px;padding:8px">${rects}</svg>`;
}
