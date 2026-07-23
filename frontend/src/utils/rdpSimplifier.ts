export interface Point2D {
  x: number;
  z: number;
  [key: string]: any;
}

/**
 * Calculates perpendicular distance from a point p to a line segment defined by p1 and p2.
 */
function getPerpendicularDistance(p: Point2D, p1: Point2D, p2: Point2D): number {
  const dx = p2.x - p1.x;
  const dz = p2.z - p1.z;

  if (dx === 0 && dz === 0) {
    const px = p.x - p1.x;
    const pz = p.z - p1.z;
    return Math.sqrt(px * px + pz * pz);
  }

  const u = ((p.x - p1.x) * dx + (p.z - p1.z) * dz) / (dx * dx + dz * dz);
  let closestX: number;
  let closestZ: number;

  if (u < 0) {
    closestX = p1.x;
    closestZ = p1.z;
  } else if (u > 1) {
    closestX = p2.x;
    closestZ = p2.z;
  } else {
    closestX = p1.x + u * dx;
    closestZ = p1.z + u * dz;
  }

  const diffX = p.x - closestX;
  const diffZ = p.z - closestZ;
  return Math.sqrt(diffX * diffX + diffZ * diffZ);
}

/**
 * Ramer-Douglas-Peucker (RDP) Vector Path Simplification Algorithm.
 * Reduces dense telemetry (X, Z) coordinates to essential key vector line points while preserving track geometry.
 *
 * @param points Array of 2D coordinates (must contain x and z properties)
 * @param epsilon Tolerance distance threshold in meters (default 0.25m)
 * @returns Filtered array of points maintaining topological geometry
 */
export function simplifyPathRDP<T extends Point2D>(points: T[], epsilon: number = 0.25): T[] {
  if (points.length <= 2) {
    return points;
  }

  let maxDistance = 0;
  let index = 0;

  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = getPerpendicularDistance(points[i], firstPoint, lastPoint);
    if (dist > maxDistance) {
      maxDistance = dist;
      index = i;
    }
  }

  if (maxDistance > epsilon) {
    const recursiveResults1 = simplifyPathRDP(points.slice(0, index + 1), epsilon);
    const recursiveResults2 = simplifyPathRDP(points.slice(index), epsilon);

    return [...recursiveResults1.slice(0, recursiveResults1.length - 1), ...recursiveResults2];
  } else {
    return [firstPoint, lastPoint];
  }
}
