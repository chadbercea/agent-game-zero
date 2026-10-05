import {
  BoxGeometry,
  ConeGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import { solid } from '../../core/mesh';
import { STATUS_COLOR } from '../../core/palette';

export const COLUMN_CUBE_HEIGHT = 0.95;
export const COLUMN_MAX_DOTS = 32;
const ORBIT_RADIUS = 0.36;
const ORBIT_ARC = 2.3;

let shared: ReturnType<typeof buildGeometry> | undefined;

function buildGeometry() {
  const arc = new TorusGeometry(ORBIT_RADIUS, 0.02, 6, 28, ORBIT_ARC);
  const head = new ConeGeometry(0.05, 0.13, 8);
  // Seat the arrowhead at the arc's end, pointing along the direction of travel.
  head.rotateZ(ORBIT_ARC);
  head.translate(Math.cos(ORBIT_ARC) * ORBIT_RADIUS, Math.sin(ORBIT_ARC) * ORBIT_RADIUS, 0);
  return { cube: new BoxGeometry(0.3, 0.3, 0.3), arc, head, dot: new SphereGeometry(0.016, 6, 4) };
}

/**
 * Work column primitive: the vertical "working" elements from the reference
 * art, between a drone and what it stands over. A green cube spins inside
 * orbiting arrows, and a dotted line runs from the drone down to the pad.
 * Its origin is on the floor under the drone; WorkColumnAnimator moves it.
 */
export class WorkColumn extends Group {
  /** Cube + orbit; floats at COLUMN_CUBE_HEIGHT. */
  readonly work = new Group();
  readonly cube: Mesh;
  readonly orbit = new Group();
  /** The dotted vertical line; dots are placed (and flowed) by the animator. */
  readonly tether: InstancedMesh;
  readonly cubeMaterial: MeshStandardMaterial;
  readonly orbitMaterial: MeshStandardMaterial;
  readonly tetherMaterial: MeshBasicMaterial;
  /** Top of the dotted line in local units: the underside of the drone above. */
  tetherTop = 1.7;

  constructor() {
    super();
    const g = (shared ??= buildGeometry());
    const green = STATUS_COLOR.working;
    this.cubeMaterial = new MeshStandardMaterial({
      color: green,
      emissive: green,
      emissiveIntensity: 0.7,
      roughness: 0.35,
      flatShading: true,
      transparent: true,
      opacity: 0.9,
    });
    this.orbitMaterial = new MeshStandardMaterial({
      color: green,
      emissive: green,
      emissiveIntensity: 0.8,
      transparent: true,
      side: DoubleSide,
    });
    this.tetherMaterial = new MeshBasicMaterial({ color: green, transparent: true, opacity: 0.9, depthWrite: false });

    this.work.position.y = COLUMN_CUBE_HEIGHT;
    this.cube = solid(g.cube, this.cubeMaterial);
    this.work.add(this.cube);
    for (const turn of [0, Math.PI]) {
      const arrow = new Group();
      arrow.add(new Mesh(g.arc, this.orbitMaterial), new Mesh(g.head, this.orbitMaterial));
      arrow.rotation.set(-Math.PI / 2, 0, turn);
      this.orbit.add(arrow);
    }
    this.work.add(this.orbit);
    this.add(this.work);

    this.tether = new InstancedMesh(g.dot, this.tetherMaterial, COLUMN_MAX_DOTS);
    this.tether.count = 0;
    this.tether.frustumCulled = false;
    this.add(this.tether);
  }

  dispose(): void {
    this.removeFromParent();
    this.tether.dispose();
    this.cubeMaterial.dispose();
    this.orbitMaterial.dispose();
    this.tetherMaterial.dispose();
  }
}
