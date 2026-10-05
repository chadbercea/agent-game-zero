import {
  BufferGeometry,
  CircleGeometry,
  Color,
  DoubleSide,
  type Curve,
  Float32BufferAttribute,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from 'three';

/** The Teamwork Graph's color: its own layer, apart from status, lineage and the gray access traces. */
export const GRAPH_COLOR = new Color('#5b74d9');

const WIDTH = 0.045;
const HEIGHT = 0.012;
const SAMPLES_PER_UNIT = 8;

let portGeometry: CircleGeometry | undefined;

/**
 * Graph edge primitive: one link in the Teamwork Graph, drawn flat on the
 * floor as a thin solid ribbon along a grid path (the access traces are dotted;
 * this is solid, so the two layers read apart on the same plane). `drawn`
 * (0–1) reveals it from its start; small ports mark where it meets each node.
 */
export class GraphEdge extends Group {
  readonly path: Curve<Vector3>;
  readonly material: MeshBasicMaterial;
  private readonly ribbon: Mesh;
  private readonly ports: Mesh[];
  private readonly vertexCount: number;
  private _drawn = 0;

  constructor(path: Curve<Vector3>) {
    super();
    this.path = path;
    this.material = new MeshBasicMaterial({
      color: GRAPH_COLOR,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      side: DoubleSide, // a flat ribbon on the floor; never culled whichever way its triangles wind
    });

    // A flat ribbon: two triangles per sample step, offset sideways on the floor.
    const steps = Math.max(2, Math.round(path.getLength() * SAMPLES_PER_UNIT));
    const points = path.getSpacedPoints(steps);
    const positions: number[] = [];
    const side = (i: number) => {
      const a = points[Math.max(0, i - 1)];
      const b = points[Math.min(points.length - 1, i + 1)];
      return new Vector3(-(b.z - a.z), 0, b.x - a.x).normalize().multiplyScalar(WIDTH / 2);
    };
    for (let i = 0; i < points.length - 1; i++) {
      const [p, q] = [points[i], points[i + 1]];
      const [sp, sq] = [side(i), side(i + 1)];
      const v = (o: Vector3, s: Vector3, sign: number) => [o.x + s.x * sign, HEIGHT, o.z + s.z * sign];
      positions.push(...v(p, sp, 1), ...v(p, sp, -1), ...v(q, sq, 1));
      positions.push(...v(q, sq, 1), ...v(p, sp, -1), ...v(q, sq, -1));
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    this.vertexCount = positions.length / 3;
    this.ribbon = new Mesh(geometry, this.material);
    this.ribbon.renderOrder = -1;
    this.add(this.ribbon);

    // Ports: small discs where the edge meets each node.
    if (!portGeometry) {
      portGeometry = new CircleGeometry(0.075, 20);
      portGeometry.rotateX(-Math.PI / 2);
    }
    this.ports = [points[0], points[points.length - 1]].map((at) => {
      const port = new Mesh(portGeometry, this.material);
      port.position.set(at.x, HEIGHT + 0.002, at.z);
      this.add(port);
      return port;
    });
    this.drawn = 0;
  }

  /** How much of the edge is drawn, from its start (0–1). */
  get drawn(): number {
    return this._drawn;
  }

  set drawn(value: number) {
    this._drawn = MathUtils.clamp(value, 0, 1);
    const triangles = Math.floor((this.vertexCount / 3) * this._drawn);
    this.ribbon.geometry.setDrawRange(0, triangles * 3);
    this.visible = this._drawn > 0;
    // The start port appears as drawing begins; the end port pops when the edge arrives.
    this.ports[0].scale.setScalar(Math.min(1, this._drawn * 8) || 0.001);
    const arrive = MathUtils.smoothstep(this._drawn, 0.92, 1);
    this.ports[1].scale.setScalar(Math.max(0.001, arrive));
  }

  dispose(): void {
    this.removeFromParent();
    this.ribbon.geometry.dispose();
    this.material.dispose();
  }
}
