import {
  CircleGeometry,
  CylinderGeometry,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { FACE_CAMERA } from '../core/grid';
import { solid } from '../core/mesh';
import { NEUTRAL, STATUS_COLOR } from '../core/palette';
import { buildEmblem, type SystemKind } from '../primitives/node/emblems';

/**
 * The node hierarchy exploration (ILI-973): three directions for how a
 * secondary (a tool) and a tertiary (an agent's own spot off a tool) look and
 * show state, each designed against the primary, the gate, which stays as it
 * is: a square pad that lights yellow (checking) then green (granted).
 *
 * Nothing here is wired into the story; these are options for Chad to pick
 * from in Storybook (Story Parts / Node Hierarchy).
 *
 * One state language across levels, as the gate has with its lights:
 * - `resting`: on the grid, nobody on it.
 * - `active`: an agent is on it and working (green, like a granted gate).
 * - `waiting`: an agent is on it, held up (yellow, like a gate checking).
 */
export type NodeState = 'resting' | 'active' | 'waiting';
export const NODE_STATES: readonly NodeState[] = ['resting', 'active', 'waiting'];

export type Direction = 'puck' | 'hex' | 'float';
export const DIRECTIONS: readonly Direction[] = ['puck', 'hex', 'float'];

/** What each direction is, in a line (for the specimen's legend in docs, not on the canvas). */
export const DIRECTION_NOTES: Record<Direction, string> = {
  puck: 'Round puck under the emblem, lit by a ring: round tools vs the square gate. Tertiaries: small pucks with the same state ring.',
  hex: 'A flat hexagon tile flush with the floor, its edge lights: tools tile the system. Tertiaries: half-size hexes docked on the tool’s edge.',
  float: 'No base: the emblem floats, bigger, over a soft halo on the floor. Tertiaries: a mini emblem with its own small halo, tethered to the tool.',
};

const stateColor = (s: NodeState) => (s === 'active' ? STATUS_COLOR.working : s === 'waiting' ? STATUS_COLOR.waiting : NEUTRAL.offLight);

/** Shared materials for emblems (white shell, graphite), per node. */
function emblemFor(kind: SystemKind, scale: number): { emblem: Group; dispose: () => void } {
  const shell = new MeshStandardMaterial({ color: NEUTRAL.shell, roughness: 0.4, flatShading: true });
  const graphite = new MeshStandardMaterial({ color: NEUTRAL.graphite, roughness: 0.45, metalness: 0.2, flatShading: true });
  const emblem = buildEmblem(kind, { shell, graphite });
  emblem.scale.setScalar(scale);
  emblem.rotation.y = FACE_CAMERA;
  return {
    emblem,
    dispose: () => {
      shell.dispose();
      graphite.dispose();
    },
  };
}

/** A node in the exploration: its state, and a clock for its idle and active motion. */
export abstract class HierarchyNode extends Group {
  state: NodeState = 'resting';
  protected time = Math.random() * 10;
  /** How lit it is (eases toward the state). */
  protected glow = 0;
  update(dt: number): void {
    this.time += dt;
    this.glow = MathUtils.lerp(this.glow, this.state === 'resting' ? 0 : 1, 1 - Math.exp(-8 * dt));
    this.apply();
  }
  protected abstract apply(): void;
}

// Secondary: three directions --------------------------------------------

/** Puck: a round, low puck under the emblem with a ring around its top that lights with state. */
class PuckSecondary extends HierarchyNode {
  private readonly ring: Mesh<TorusGeometry, MeshStandardMaterial>;
  private readonly emblem: Group;
  constructor(kind: SystemKind) {
    super();
    const body = new MeshStandardMaterial({ color: NEUTRAL.shell, roughness: 0.4 });
    this.add(solid(new CylinderGeometry(0.5, 0.54, 0.14, 40), body)).position.y = 0.07;
    this.ring = new Mesh(new TorusGeometry(0.5, 0.035, 8, 48), new MeshStandardMaterial({ color: NEUTRAL.offLight, emissive: NEUTRAL.offLight }));
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.y = 0.145;
    this.add(this.ring);
    this.emblem = emblemFor(kind, 1.3).emblem;
    this.emblem.position.y = 0.62;
    this.add(this.emblem);
  }
  protected apply(): void {
    const c = stateColor(this.state);
    this.ring.material.color.copy(c);
    this.ring.material.emissive.copy(c);
    this.ring.material.emissiveIntensity = 0.2 + this.glow * (1.4 + Math.sin(this.time * 4) * 0.3);
    // Active: the emblem turns slowly, like a tool in use; resting, it just bobs.
    this.emblem.position.y = 0.62 + Math.sin(this.time * 1.4) * 0.03;
    this.emblem.rotation.y = FACE_CAMERA + (this.state === 'active' ? this.time * 0.9 : Math.sin(this.time * 0.5) * 0.25);
  }
}

/** Hex: a thin hexagonal tile flush with the floor; its edge glows with state. */
class HexSecondary extends HierarchyNode {
  private readonly edge: Mesh<RingGeometry, MeshBasicMaterial>;
  private readonly emblem: Group;
  constructor(kind: SystemKind) {
    super();
    const tile = solid(new CylinderGeometry(0.62, 0.62, 0.05, 6), new MeshStandardMaterial({ color: NEUTRAL.shell, roughness: 0.45, flatShading: true }));
    tile.position.y = 0.025;
    this.add(tile);
    this.edge = new Mesh(new RingGeometry(0.62, 0.72, 6), new MeshBasicMaterial({ color: NEUTRAL.offLight, transparent: true, opacity: 0.5, depthWrite: false }));
    this.edge.rotation.x = -Math.PI / 2;
    this.edge.position.y = 0.006;
    this.add(this.edge);
    this.emblem = emblemFor(kind, 1.25).emblem;
    this.emblem.position.y = 0.55;
    this.add(this.emblem);
  }
  protected apply(): void {
    this.edge.material.color.copy(stateColor(this.state));
    this.edge.material.opacity = 0.35 + this.glow * (0.5 + Math.sin(this.time * 3) * 0.1);
    this.emblem.position.y = 0.55 + Math.sin(this.time * 1.4) * 0.03 + this.glow * 0.08;
    this.emblem.rotation.y = FACE_CAMERA + Math.sin(this.time * 0.5) * 0.25;
  }
}

/** Float: no base at all. A bigger emblem floats over a soft halo on the floor, which takes the state color. */
class FloatSecondary extends HierarchyNode {
  private readonly halo: Mesh<CircleGeometry, MeshBasicMaterial>;
  private readonly emblem: Group;
  constructor(kind: SystemKind) {
    super();
    this.halo = new Mesh(new CircleGeometry(0.6, 40), new MeshBasicMaterial({ color: NEUTRAL.offLight, transparent: true, opacity: 0.35, depthWrite: false }));
    this.halo.rotation.x = -Math.PI / 2;
    this.halo.position.y = 0.005;
    this.add(this.halo);
    this.emblem = emblemFor(kind, 1.75).emblem;
    this.emblem.position.y = 0.75;
    this.add(this.emblem);
  }
  protected apply(): void {
    this.halo.material.color.copy(stateColor(this.state));
    this.halo.material.opacity = 0.14 + this.glow * 0.22;
    this.halo.scale.setScalar(1 + this.glow * (0.12 + Math.sin(this.time * 3) * 0.04));
    this.emblem.position.y = 0.75 + Math.sin(this.time * 1.2) * 0.05;
    this.emblem.rotation.y = FACE_CAMERA + Math.sin(this.time * 0.5) * 0.3;
  }
}

export function secondary(direction: Direction, kind: SystemKind): HierarchyNode {
  return direction === 'puck' ? new PuckSecondary(kind) : direction === 'hex' ? new HexSecondary(kind) : new FloatSecondary(kind);
}

// Tertiary: three directions, one per secondary ---------------------------

/** A tertiary: small, subordinate, tied to its tool. Neutral like its tool: it lights only with its state. */
abstract class Tertiary extends HierarchyNode {
  /** Born off its tool (0 → 1) and released when the work ends (1 → 0). */
  set grown(t: number) {
    this.scale.setScalar(Math.max(0.001, t));
  }
}

class PuckTertiary extends Tertiary {
  private readonly ring: Mesh<TorusGeometry, MeshStandardMaterial>;
  constructor() {
    super();
    this.add(solid(new CylinderGeometry(0.24, 0.26, 0.08, 28), new MeshStandardMaterial({ color: NEUTRAL.shell, roughness: 0.4 }))).position.y = 0.04;
    this.ring = new Mesh(new TorusGeometry(0.24, 0.025, 6, 32), new MeshStandardMaterial({ color: NEUTRAL.offLight, emissive: NEUTRAL.offLight }));
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.y = 0.085;
    this.add(this.ring);
  }
  protected apply(): void {
    const c = stateColor(this.state);
    this.ring.material.color.copy(c);
    this.ring.material.emissive.copy(c);
    this.ring.material.emissiveIntensity = 0.2 + this.glow * 1.2;
  }
}

class HexTertiary extends Tertiary {
  private readonly edge: Mesh<RingGeometry, MeshBasicMaterial>;
  constructor() {
    super();
    const tile = solid(new CylinderGeometry(0.3, 0.3, 0.04, 6), new MeshStandardMaterial({ color: NEUTRAL.shell, roughness: 0.45, flatShading: true }));
    tile.position.y = 0.02;
    this.add(tile);
    this.edge = new Mesh(new RingGeometry(0.3, 0.36, 6), new MeshBasicMaterial({ color: NEUTRAL.offLight, transparent: true, depthWrite: false }));
    this.edge.rotation.x = -Math.PI / 2;
    this.edge.position.y = 0.005;
    this.add(this.edge);
  }
  protected apply(): void {
    this.edge.material.opacity = 0.45 + this.glow * 0.45;
    this.edge.material.color.copy(stateColor(this.state));
  }
}

class FloatTertiary extends Tertiary {
  private readonly halo: Mesh<CircleGeometry, MeshBasicMaterial>;
  private readonly mote: Mesh;
  constructor() {
    super();
    this.halo = new Mesh(new CircleGeometry(0.3, 28), new MeshBasicMaterial({ color: NEUTRAL.offLight, transparent: true, opacity: 0.35, depthWrite: false }));
    this.halo.rotation.x = -Math.PI / 2;
    this.halo.position.y = 0.004;
    this.add(this.halo);
    this.mote = solid(new CylinderGeometry(0.1, 0.1, 0.1, 6), new MeshStandardMaterial({ color: NEUTRAL.shell, flatShading: true }));
    this.mote.position.y = 0.45;
    this.add(this.mote);
  }
  protected apply(): void {
    this.halo.material.opacity = 0.2 + this.glow * 0.3;
    this.halo.material.color.copy(stateColor(this.state));
    this.mote.position.y = 0.45 + Math.sin(this.time * 1.6) * 0.04;
    this.mote.rotation.y = this.time * (this.state === 'active' ? 1.2 : 0.3);
  }
}

export function tertiary(direction: Direction): Tertiary {
  return direction === 'puck' ? new PuckTertiary() : direction === 'hex' ? new HexTertiary() : new FloatTertiary();
}

/**
 * Where a tertiary sits off its secondary: on the tool's far side from the
 * gate (screen-right, a touch down), docked on the edge for hex, a short hop
 * for puck and float.
 */
export function tertiaryOffset(direction: Direction): Vector3 {
  const right = new Vector3(1, 0, -1).normalize();
  const down = new Vector3(1, 0, 1).normalize();
  return right.multiplyScalar(direction === 'hex' ? 1.0 : 1.35).addScaledVector(down, 0.45);
}
