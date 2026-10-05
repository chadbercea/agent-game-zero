import { Curve, CurvePath, LineCurve3, QuadraticBezierCurve3, Vector3 } from 'three';

/**
 * Turn an axis-aligned polyline (every segment along world X or Z, i.e. the
 * two isometric diagonals on screen) into a path with rounded bends of
 * `radius`. Straight runs stay exactly on the grid lines.
 */
export function roundedPath(points: Vector3[], radius: number): CurvePath<Vector3> {
  const path = new CurvePath<Vector3>();
  let from = points[0].clone();
  for (let i = 1; i < points.length - 1; i++) {
    const corner = points[i];
    const inDir = corner.clone().sub(points[i - 1]);
    const outDir = points[i + 1].clone().sub(corner);
    // Never round more than half of either neighbouring segment.
    const r = Math.min(radius, inDir.length() / 2, outDir.length() / 2);
    const enter = corner.clone().addScaledVector(inDir.normalize(), -r);
    const exit = corner.clone().addScaledVector(outDir.normalize(), r);
    if (from.distanceTo(enter) > 1e-6) path.add(new LineCurve3(from, enter));
    path.add(new QuadraticBezierCurve3(enter, corner.clone(), exit));
    from = exit;
  }
  path.add(new LineCurve3(from, points[points.length - 1].clone()));
  return path;
}

/** Shorten a polyline by `start` at its beginning and `end` at its finish, along its own segments. */
export function trimPolyline(points: Vector3[], start: number, end: number): Vector3[] {
  const cut = (pts: Vector3[], amount: number): Vector3[] => {
    const out = pts.map((p) => p.clone());
    let left = amount;
    while (out.length > 1 && left > 0) {
      const seg = out[1].distanceTo(out[0]);
      if (seg > left) {
        out[0].lerp(out[1], left / seg);
        return out;
      }
      left -= seg;
      out.shift();
    }
    return out;
  };
  return cut(cut(points, start).reverse(), end).reverse();
}

/** Shortest distance from a point to an axis-aligned polyline, on the floor plane. */
export function distanceToPolyline(x: number, z: number, points: Vector3[]): number {
  let best = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const cx = Math.min(Math.max(x, Math.min(a.x, b.x)), Math.max(a.x, b.x));
    const cz = Math.min(Math.max(z, Math.min(a.z, b.z)), Math.max(a.z, b.z));
    best = Math.min(best, Math.hypot(x - cx, z - cz));
  }
  return best;
}

/** The same path traversed end to start (e.g. a branch ridden from node back to gate). */
export function reversed(curve: Curve<Vector3>): Curve<Vector3> {
  return new Reversed(curve);
}

class Reversed extends Curve<Vector3> {
  constructor(private readonly curve: Curve<Vector3>) {
    super();
  }

  override getPoint(t: number, target = new Vector3()): Vector3 {
    return this.curve.getPoint(1 - t, target);
  }
}
