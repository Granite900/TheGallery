/**
 * Minimal 2D collision: the player is a vertical capsule, but since every
 * floor is flat and every wall is full-height, collision reduces to a
 * circle-vs-AABB problem in the XZ plane. Resolution pushes the circle out
 * along the minimum translation vector; two passes keep corners stable so
 * the player can never tunnel through geometry.
 */

export interface Aabb {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function rectContains(r: Aabb, x: number, z: number): boolean {
  return x >= r.x1 && x <= r.x2 && z >= r.z1 && z <= r.z2;
}

/** Push a circle at (px, pz) with radius r out of every AABB. Returns resolved position. */
export function resolveCircle(
  px: number,
  pz: number,
  r: number,
  boxes: readonly Aabb[],
): { x: number; z: number } {
  const r2 = r * r;
  for (let pass = 0; pass < 2; pass++) {
    for (const b of boxes) {
      const cx = clamp(px, b.x1, b.x2);
      const cz = clamp(pz, b.z1, b.z2);
      const dx = px - cx;
      const dz = pz - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r2) continue;

      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        const push = (r - d) / d;
        px += dx * push;
        pz += dz * push;
      } else {
        // Circle centre is inside the box: exit through the nearest face.
        const toWest = px - (b.x1 - r);
        const toEast = b.x2 + r - px;
        const toNorth = pz - (b.z1 - r);
        const toSouth = b.z2 + r - pz;
        const m = Math.min(toWest, toEast, toNorth, toSouth);
        if (m === toWest) px = b.x1 - r;
        else if (m === toEast) px = b.x2 + r;
        else if (m === toNorth) pz = b.z1 - r;
        else pz = b.z2 + r;
      }
    }
  }
  return { x: px, z: pz };
}
