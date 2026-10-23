import {
  Color,
  type Curve,
  Group,
  InstancedMesh,
  MathUtils,
  Matrix4,
  MeshBasicMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { GridFade } from '../branch/GridFade';

/** The Teamwork Graph's color: its own layer, apart from status, lineage and the gray access traces. */
export const GRAPH_COLOR = new Color('#5b74d9');

/** Same dot pitch and size as the access traces, so the two layers read as one family. */
const SPACING = 0.14;
const DOT_RADIUS = 0.03;
const DOT_HEIGHT = 0.03;
/** How fast the dots march along the edge (world units per second): calm, always moving. */
export const FLOW_SPEED = 0.35;

let dotGeometry: SphereGeometry | undefined;
const matrix = new Matrix4();
const point = new Vector3();

/**
 * Graph edge primitive: one link in the Teamwork Graph, drawn on the floor as
 * a line of blue dots along a grid path that march steadily from its start to
 * its end. The access traces are gray and still; graph edges are blue and
 * moving, so the two layers read apart on the same plane. `drawn` (0–1)
 * reveals it from its start.
 */
export class GraphEdge extends Group {
  readonly path: Curve<Vector3>;
  readonly material: MeshBasicMaterial;
  /** The faint grid under it: up while it draws, gone a moment after (see GridFade). */
  readonly grid: GridFade;
  private readonly dots: InstancedMesh;
  private readonly length: number;
  private readonly capacity: number;
  private _drawn = 0;
  private flow = 0;

  constructor(path: Curve<Vector3>) {
    super();
    this.path = path;
    this.length = path.getLength();
    this.material = new MeshBasicMaterial({ color: GRAPH_COLOR, transparent: true, opacity: 0.85, depthWrite: false });
    this.capacity = Math.max(2, Math.ceil(this.length / SPACING) + 1);
    this.dots = new InstancedMesh((dotGeometry ??= new SphereGeometry(DOT_RADIUS, 6, 4)), this.material, this.capacity);
    this.dots.frustumCulled = false;
    this.add(this.dots);
    this.grid = new GridFade(path);
    this.grid.follow(this);
    this.drawn = 0;
  }

  /** How much of the edge is drawn, from its start (0–1). */
  get drawn(): number {
    return this._drawn;
  }

  set drawn(value: number) {
    const before = this._drawn;
    this._drawn = MathUtils.clamp(value, 0, 1);
    if (this._drawn > before) this.grid.pulse();
    this.visible = this._drawn > 0;
    this.place();
  }

  /** March the dots along the edge. */
  update(dt: number): void {
    if (!this.visible) return;
    this.flow = (this.flow + FLOW_SPEED * dt) % SPACING;
    this.place();
  }

  dispose(): void {
    this.removeFromParent();
    this.grid.dispose();
    this.dots.dispose();
    this.material.dispose();
  }

  /** Dots every SPACING along the drawn part, shifted by the flow; dots ease in and out at the ends. */
  private place(): void {
    const end = this.length * this._drawn;
    let n = 0;
    for (let s = this.flow; s <= end && n < this.capacity; s += SPACING, n++) {
      this.path.getPointAt(Math.min(1, s / this.length), point);
      const fade = Math.min(1, s / SPACING, (end - s) / SPACING);
      matrix.makeScale(fade, fade, fade).setPosition(point.x, DOT_HEIGHT, point.z);
      this.dots.setMatrixAt(n, matrix);
    }
    this.dots.count = n;
    this.dots.instanceMatrix.needsUpdate = true;
  }
}
