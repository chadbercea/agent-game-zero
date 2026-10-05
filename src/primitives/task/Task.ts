import {
  BoxGeometry,
  ConeGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import { at, solid } from '../../core/mesh';
import { NEUTRAL, STATUS_COLOR, type Status } from '../../core/palette';
import { HOVER_HEIGHT, SUB_AGENT_SCALE } from '../drone/Drone';
import { Pad } from '../pad/Pad';

export interface TaskOptions {
  status?: Status;
  /** Matches a sub-agent drone's smaller scale. */
  subAgent?: boolean;
}

/** Animation hooks. TaskAnimator writes to these; the primitive never animates itself. */
export interface TaskRig {
  /** Floating work item between pad and drone. */
  work: Group;
  cube: Mesh;
  /** "!" on the cube's camera-facing sides (Stopped). */
  glyph: Group;
  /** Small marker bobbing above the cube (Waiting). */
  marker: Mesh;
  /** Arrows circling the cube (Working). */
  orbit: Group;
  /** Dotted line linking the drone above to its work. */
  tether: InstancedMesh;
  cubeMaterial: MeshStandardMaterial;
  screenMaterial: MeshStandardMaterial;
  skirtMaterial: MeshStandardMaterial;
  glowMaterial: MeshBasicMaterial;
  orbitMaterial: MeshStandardMaterial;
  tetherMaterial: MeshBasicMaterial;
}

export { FLOOR_GLOW_OPACITY, PAD_TOP, SCREEN_GLOW, SKIRT_GLOW } from '../pad/Pad';
export const WORK_HEIGHT = 0.95;
export const TETHER_MAX_DOTS = 32;

const ORBIT_RADIUS = 0.36;
const ORBIT_ARC = 2.3;

let shared: ReturnType<typeof buildGeometry> | undefined;

function buildGeometry() {
  const arc = new TorusGeometry(ORBIT_RADIUS, 0.02, 6, 28, ORBIT_ARC);
  const head = new ConeGeometry(0.05, 0.13, 8);
  // Seat the arrowhead at the arc's end, pointing along the direction of travel.
  head.rotateZ(ORBIT_ARC);
  head.translate(Math.cos(ORBIT_ARC) * ORBIT_RADIUS, Math.sin(ORBIT_ARC) * ORBIT_RADIUS, 0);
  return {
    cube: new BoxGeometry(0.3, 0.3, 0.3),
    glyphBar: new BoxGeometry(0.05, 0.13, 0.012),
    glyphDot: new BoxGeometry(0.05, 0.045, 0.012),
    marker: new OctahedronGeometry(0.055),
    arc,
    head,
    dot: new SphereGeometry(0.016, 6, 4),
  };
}

/**
 * Task primitive: the physical work object beneath a drone. Its origin is on
 * the floor, matching the Drone's, so a drone and its task share a position.
 * Front faces local +Z, like the drone.
 */
export class Task extends Group {
  readonly rig: TaskRig;
  readonly pad: Pad;
  readonly subAgent: boolean;
  /** Top of the tether in local units; defaults to the underside of a hovering drone. */
  tetherTop = HOVER_HEIGHT - 0.42;
  private _status: Status;
  private readonly materials: Material[] = [];

  constructor(options: TaskOptions = {}) {
    super();
    const { status = 'waiting', subAgent = false } = options;
    this._status = status;
    this.subAgent = subAgent;
    const g = (shared ??= buildGeometry());

    this.pad = new Pad();
    this.add(this.pad);
    const { screenMaterial, skirtMaterial, glowMaterial } = this.pad;
    const cubeMaterial = this.track(
      new MeshStandardMaterial({ roughness: 0.35, metalness: 0, flatShading: true, transparent: true }),
    );
    const glyphMaterial = this.track(new MeshBasicMaterial({ color: 0xffffff }));
    const markerMaterial = this.track(
      new MeshStandardMaterial({ color: STATUS_COLOR.waiting, emissive: STATUS_COLOR.waiting, emissiveIntensity: 0.6, flatShading: true, transparent: true }),
    );
    const orbitMaterial = this.track(
      new MeshStandardMaterial({ color: STATUS_COLOR.working, emissive: STATUS_COLOR.working, emissiveIntensity: 0.8, transparent: true, side: DoubleSide }),
    );
    const tetherMaterial = this.track(new MeshBasicMaterial({ transparent: true }));

    // Work item.
    const work = new Group();
    work.name = 'work';
    work.position.y = WORK_HEIGHT;
    const cube = solid(g.cube, cubeMaterial);
    work.add(cube);

    const glyph = new Group();
    for (const yaw of [0, Math.PI / 2]) {
      const face = new Group();
      face.rotation.y = yaw;
      const bar = at(new Mesh(g.glyphBar, glyphMaterial), 0.035);
      const dot = at(new Mesh(g.glyphDot, glyphMaterial), -0.085);
      bar.position.z = dot.position.z = 0.151;
      face.add(bar, dot);
      glyph.add(face);
    }
    cube.add(glyph);

    const marker = at(new Mesh(g.marker, markerMaterial), 0.3);
    work.add(marker);

    const orbit = new Group();
    for (const turn of [0, Math.PI]) {
      const arrow = new Group();
      arrow.add(new Mesh(g.arc, orbitMaterial), new Mesh(g.head, orbitMaterial));
      arrow.rotation.set(-Math.PI / 2, 0, turn);
      orbit.add(arrow);
    }
    work.add(orbit);
    this.add(work);

    const tether = new InstancedMesh(g.dot, tetherMaterial, TETHER_MAX_DOTS);
    tether.count = 0;
    tether.frustumCulled = false;
    this.add(tether);

    this.rig = { work, cube, glyph, marker, orbit, tether, cubeMaterial, screenMaterial, skirtMaterial, glowMaterial, orbitMaterial, tetherMaterial };

    if (subAgent) this.scale.setScalar(SUB_AGENT_SCALE);
    this.applyStatus();
  }

  get status(): Status {
    return this._status;
  }

  set status(value: Status) {
    if (value === this._status) return;
    this._status = value;
    this.applyStatus();
  }

  dispose(): void {
    this.removeFromParent();
    this.rig.tether.dispose();
    this.pad.dispose();
    for (const m of this.materials) m.dispose();
  }

  private applyStatus(): void {
    const color = STATUS_COLOR[this._status];
    const { cubeMaterial, tetherMaterial } = this.rig;
    this.pad.setColor(color);
    tetherMaterial.color.copy(color);

    // Stopped: solid alarm block. Waiting: pale translucent. Working: lit and glassy.
    cubeMaterial.color.copy(color);
    cubeMaterial.emissive.copy(color);
    if (this._status === 'stopped') {
      cubeMaterial.emissiveIntensity = 0.55;
      cubeMaterial.opacity = 1;
    } else if (this._status === 'waiting') {
      cubeMaterial.color.lerp(NEUTRAL.backdrop, 0.45);
      cubeMaterial.emissiveIntensity = 0.25;
      cubeMaterial.opacity = 0.72;
    } else {
      cubeMaterial.emissiveIntensity = 0.7;
      cubeMaterial.opacity = 0.9;
    }
  }

  private track<M extends Material>(material: M): M {
    this.materials.push(material);
    return material;
  }
}
