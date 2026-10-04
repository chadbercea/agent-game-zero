import { type Object3D, QuadraticBezierCurve3, Vector3 } from 'three';

/** Default arc height for routes between agents. */
export const ROUTE_LIFT = 0.9;

const a = new Vector3();
const b = new Vector3();

/**
 * Shape `curve` into a shallow arc between two objects' world positions,
 * peaking `lift` above their midpoint. Shared by packet flights and
 * connections so a packet always travels exactly along its connection.
 */
export function arcBetween(from: Object3D, to: Object3D, lift: number, curve: QuadraticBezierCurve3): QuadraticBezierCurve3 {
  from.getWorldPosition(a);
  to.getWorldPosition(b);
  curve.v0.copy(a);
  curve.v2.copy(b);
  curve.v1.addVectors(a, b).multiplyScalar(0.5);
  curve.v1.y += lift;
  curve.updateArcLengths();
  return curve;
}

export const newArc = () => new QuadraticBezierCurve3(new Vector3(), new Vector3(), new Vector3());
