import {
  type Color,
  type Curve,
  Group,
  InstancedMesh,
  MathUtils,
  Matrix4,
  MeshBasicMaterial,
  SphereGeometry,
  Vector3,
} from 'three';

const SPACING = 0.14;
const DOT_HEIGHT = 0.03;

let dotGeometry: SphereGeometry | undefined;

/**
 * Branch primitive: a dotted line on the floor along a path (a rounded grid
 * route, see gridPath), connecting a gate to one of its system nodes.
 * `drawn` (0–1) reveals it from the gate outward; `opacity` fades the whole line.
 */
export class Branch extends Group {
  readonly curve: Curve<Vector3>;
  readonly material: MeshBasicMaterial;
  private readonly dots: InstancedMesh;
  private readonly total: number;
  private _drawn = 0;

  constructor(curve: Curve<Vector3>, color: Color) {
    super();
    this.curve = curve;
    this.material = new MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false });
    this.total = Math.max(2, Math.round(curve.getLength() / SPACING));
    this.dots = new InstancedMesh((dotGeometry ??= new SphereGeometry(0.03, 6, 4)), this.material, this.total);
    this.dots.frustumCulled = false;
    const m = new Matrix4();
    const p = new Vector3();
    for (let i = 0; i < this.total; i++) {
      curve.getPointAt(i / (this.total - 1), p);
      this.dots.setMatrixAt(i, m.makeTranslation(p.x, DOT_HEIGHT, p.z));
    }
    this.dots.count = 0;
    this.add(this.dots);
  }

  /** How much of the branch is drawn, from the gate end (0–1). */
  get drawn(): number {
    return this._drawn;
  }

  set drawn(value: number) {
    this._drawn = MathUtils.clamp(value, 0, 1);
    this.dots.count = Math.round(this.total * this._drawn);
  }

  dispose(): void {
    this.removeFromParent();
    this.dots.dispose();
    this.material.dispose();
  }
}
