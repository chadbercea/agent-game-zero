import { BoxGeometry, CylinderGeometry, Group, InstancedMesh, Matrix4, MeshStandardMaterial, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { solid } from '../../core/mesh';
import { NEUTRAL } from '../../core/palette';

/** Height of the belt's top surface: what rides on it sits here. */
export const BELT_TOP = 0.3;
const WIDTH = 0.62;
const SLAT_SPACING = 0.22;

const slatAt = new Matrix4();

/**
 * Conveyor belt primitive: a low-poly belt on a frame, running along its
 * local +x for `length`. Graphite rails and end rollers, a light belt with
 * dark slats that move at `speed` (world units per second) in `update(dt)`.
 * What rides it is placed with `pointAt(t)` (0 = start, 1 = end, on top of
 * the belt) by whoever moves it.
 */
export class Conveyor extends Group {
  speed = 0.9;
  private readonly slats: InstancedMesh;
  private readonly slatCount: number;
  private offset = 0;
  private readonly materials: MeshStandardMaterial[];

  constructor(readonly length: number) {
    super();
    const shell = new MeshStandardMaterial({ color: NEUTRAL.shell, roughness: 0.55 });
    const graphite = new MeshStandardMaterial({ color: NEUTRAL.graphite, roughness: 0.5, flatShading: true });
    const slatMaterial = new MeshStandardMaterial({ color: NEUTRAL.shellShade, roughness: 0.6 });
    this.materials = [shell, graphite, slatMaterial];

    // The belt: a long light slab between two graphite rails.
    const belt = solid(new RoundedBoxGeometry(length, 0.08, WIDTH, 2, 0.03), shell);
    belt.position.set(length / 2, BELT_TOP - 0.04, 0);
    this.add(belt);
    for (const side of [-1, 1]) {
      const rail = solid(new BoxGeometry(length + 0.1, 0.12, 0.06), graphite);
      rail.position.set(length / 2, BELT_TOP - 0.06, side * (WIDTH / 2 + 0.03));
      this.add(rail);
    }
    // Rollers at the ends, and short legs.
    for (const x of [0, length]) {
      const roller = solid(new CylinderGeometry(0.09, 0.09, WIDTH + 0.02, 10), graphite);
      roller.rotation.x = Math.PI / 2;
      roller.position.set(x, BELT_TOP - 0.08, 0);
      this.add(roller);
    }
    const legGeometry = new BoxGeometry(0.06, BELT_TOP - 0.12, 0.06);
    for (let x = 0.15; x < length; x += Math.max(0.8, length / 4)) {
      for (const side of [-1, 1]) {
        const leg = solid(legGeometry, graphite);
        leg.position.set(x, (BELT_TOP - 0.12) / 2, side * (WIDTH / 2 + 0.03));
        this.add(leg);
      }
    }
    // Slats across the belt, moving along it.
    this.slatCount = Math.floor(length / SLAT_SPACING);
    this.slats = new InstancedMesh(new BoxGeometry(0.035, 0.012, WIDTH - 0.08), slatMaterial, this.slatCount);
    this.add(this.slats);
    this.update(0);
  }

  /** A point on top of the belt, t from its start (0) to its end (1), in world space. */
  pointAt(t: number, target = new Vector3()): Vector3 {
    target.set(t * this.length, BELT_TOP, 0);
    return this.localToWorld(target);
  }

  update(dt: number): void {
    this.offset = (this.offset + dt * this.speed) % SLAT_SPACING;
    for (let i = 0; i < this.slatCount; i++) {
      slatAt.makeTranslation(i * SLAT_SPACING + this.offset, BELT_TOP + 0.006, 0);
      this.slats.setMatrixAt(i, slatAt);
    }
    this.slats.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.removeFromParent();
    this.slats.dispose();
    for (const m of this.materials) m.dispose();
  }
}
