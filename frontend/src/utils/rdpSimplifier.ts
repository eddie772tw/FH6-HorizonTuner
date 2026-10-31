export interface Point2D {
  x: number;
  z: number;
  [key: string]: any;
}

/**
 * Ramer-Douglas-Peucker (RDP) Vector Path Simplification Algorithm.
 * Reduces dense telemetry (X, Z) coordinates to essential key vector line points while preserving track geometry.
 *
 * [PERF] Iterative stack-based implementation:
 * - Hoists segment invariant calculations (dx, dz, inverted line length) outside inner scan loops.
 * - Compares squared distances to eliminate thousands of Math.sqrt calls across dense telemetry tracks.
 * - Uses a Uint8Array marker bitmap instead of recursive array slicing and spread allocations.
 * - Eliminates call stack overflow risk on large datasets.
 */
export function simplifyPathRDP<T extends Point2D>(points: T[], epsilon: number = 0.25): T[] {
  const len = points.length;
  if (len <= 2) return points;

  const sqEpsilon = epsilon * epsilon;
  const keep = new Uint8Array(len);
  keep[0] = 1;
  keep[len - 1] = 1;

  const stack: number[] = [0, len - 1];

  while (stack.length > 0) {
    const end = stack.pop()!;
    const start = stack.pop()!;
    const pStart = points[start];
    const pEnd = points[end];
    const pStartX = pStart.x, pStartZ = pStart.z;
    const dx = pEnd.x - pStartX, dz = pEnd.z - pStartZ;
    const lineLenSq = dx * dx + dz * dz;

    let maxDistSq = 0, maxIdx = 0;

    if (lineLenSq === 0) {
      for (let i = start + 1; i < end; i++) {
        const pt = points[i];
        const px = pt.x - pStartX, pz = pt.z - pStartZ;
        const distSq = px * px + pz * pz;
        if (distSq > maxDistSq) { maxDistSq = distSq; maxIdx = i; }
      }
    } else {
      const invLineLenSq = 1 / lineLenSq;
      for (let i = start + 1; i < end; i++) {
        const pt = points[i];
        const px = pt.x - pStartX, pz = pt.z - pStartZ;
        const u = (px * dx + pz * dz) * invLineLenSq;
        const cx = u < 0 ? pStartX : u > 1 ? pEnd.x : pStartX + u * dx;
        const cz = u < 0 ? pStartZ : u > 1 ? pEnd.z : pStartZ + u * dz;
        const diffX = pt.x - cx, diffZ = pt.z - cz;
        const distSq = diffX * diffX + diffZ * diffZ;
        if (distSq > maxDistSq) { maxDistSq = distSq; maxIdx = i; }
      }
    }

    if (maxDistSq > sqEpsilon) {
      keep[maxIdx] = 1;
      stack.push(start, maxIdx, maxIdx, end);
    }
  }

  const result: T[] = [];
  for (let i = 0; i < len; i++) {
    if (keep[i] === 1) result.push(points[i]);
  }
  return result;
}
