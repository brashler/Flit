/**
 * Approximate distance & angle helpers.
 *
 * Ported from C++ headers contributed to this repo under MIT.
 * octagonalDistance implements the integer-only approximation from
 * "Fast Approximate Distance Functions", flipcode:
 * https://www.flipcode.com/archives/Fast_Approximate_Distance_Functions.shtml
 * See THIRD_PARTY_NOTICES.md.
 */

/**
 * Diamond angle of a vector to the origin: a taxicab-geometry angle in
 * the range [0, 4). Cheap and branchy instead of trigonometric — useful
 * for comparing directions (e.g. joystick input). Undefined at (0, 0).
 */
export function diamondAngle(y: number, x: number): number {
  if (y >= 0) {
    return x >= 0 ? y / (x + y) : 1 - x / (-x + y);
  }
  return x < 0 ? 2 - y / (-x - y) : 3 + x / (x - y);
}

/**
 * Octagonal approximation of Euclidean distance between two points.
 * Integer-only; creates a faceted metric space. Max error ~4-5%.
 */
export function octagonalDistanceBetween(x1: number, y1: number, x2: number, y2: number): number {
  return octagonalDistance(x2 - x1, y2 - y1);
}

/** Octagonal approximation of Euclidean length of (dx, dy). */
export function octagonalDistance(dx: number, dy: number): number {
  const x = Math.abs(dx | 0);
  const y = Math.abs(dy | 0);
  const min = Math.min(x, y);
  const max = Math.max(x, y);

  let approx = max * 1007 + min * 441;
  if (max < min * 16) {
    approx -= max * 40;
  }
  // +512 for proper rounding
  return (approx + 512) >> 10;
}
