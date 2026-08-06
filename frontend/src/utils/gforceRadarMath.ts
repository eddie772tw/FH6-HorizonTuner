/**
 * GForceRadar 物理與極座標幾何計算 Helper (Pure Functions)
 */

export interface GPointOffset {
  dx: number;
  dy: number;
  dist: number;
}

/**
 * 計算 G 力指示點的安全偏置 (dx, dy)
 * @param lat 橫向 G 力 (Lateral G)
 * @param lon 縱向 G 力 (Longitudinal G)
 * @param radius 雷達圖半徑 (像素)
 * @param dotRadius 指示點半徑 (像素)
 * @param gScale 比例尺 (1.0 代表 1.0G 位於 0.5 半徑處；2.0G 為邊界)
 */
export function calculateGPointOffset(
  lat: number,
  lon: number,
  radius: number,
  dotRadius: number = 7,
  gScale: number = 1.0
): GPointOffset {
  if (radius <= 0) return { dx: 0, dy: 0, dist: 0 };

  const scaleFactor = (radius * 0.5) * gScale;
  let dx = lat * scaleFactor;
  let dy = lon * scaleFactor;

  let dist = Math.sqrt(dx * dx + dy * dy);
  const maxR = Math.max(0, radius - dotRadius);

  if (dist > maxR && dist > 0) {
    dx = (dx / dist) * maxR;
    dy = (dy / dist) * maxR;
    dist = maxR;
  }

  return { dx, dy, dist };
}

/**
 * 根據容器長寬計算不會變形與溢出的最佳雷達正圓直徑
 * @param containerWidth 容器寬度
 * @param containerHeight 容器高度
 * @param labelHeight 下方/周圍文字標籤與 margin 所需保留高度
 * @param minSize 最小允許直徑
 * @param maxSize 最大允許直徑
 */
export function calculateRadarDiameter(
  containerWidth: number,
  containerHeight: number,
  labelHeight: number = 40,
  minSize: number = 120,
  maxSize: number = 260
): number {
  const availW = Math.max(0, containerWidth - 8); // 扣除 padding 邊距
  const availH = Math.max(0, containerHeight - labelHeight);
  const rawSize = Math.min(availW, availH);
  if (rawSize <= 0) return minSize;
  return Math.max(minSize, Math.min(maxSize, rawSize));
}
