import { type Curve, MathUtils, type Object3D, Vector3 } from 'three';
import { NEUTRAL } from '../core/palette';
import { Branch, branchCurve } from '../primitives/branch/Branch';
import type { SystemKind } from '../primitives/node/emblems';
import { EMBLEM_HEIGHT, EMBLEM_SCALE, SystemNode } from '../primitives/node/SystemNode';
import { FACE_CAMERA } from '../stage/spawnDrone';
import type { SceneHost } from '../stage/Stage';

/** Screen directions on the floor, as seen from the isometric camera. */
const SCREEN_RIGHT = new Vector3(1, 0, -1).normalize();
const SCREEN_AWAY = new Vector3(-1, 0, -1).normalize();

export interface SystemMapOptions {
  /** How far behind the gate (on screen: above it) the nodes sit. */
  depth?: number;
  /** Spacing between nodes across the screen. */
  spread?: number;
}

const LINE_FADE = 3;
const BRANCH_INSET_GATE = 0.7;
const BRANCH_INSET_NODE = 0.75;
const LINE_OPACITY = 0.8;

/**
 * The system behind a gate: one node per system, fanned out above the gate on
 * screen, each joined to the gate by a branch. Everything starts hidden and
 * only appears when access is granted (see revealMap). Lines are never
 * persistent: they draw in during the reveal, fade out, and come back only
 * while `linesVisible` is set (hover or click).
 */
export class SystemMap {
  readonly nodes: SystemNode[] = [];
  readonly branches: Branch[] = [];
  /** Flight paths from the gate's center to each node's center, along its branch. */
  readonly routes: Curve<Vector3>[] = [];
  /** Show the branch lines (e.g. while the gate or a node is hovered or selected). */
  linesVisible = false;
  revealed = false;
  private lineLevel = 0;
  private time = 0;
  private readonly untick: () => void;

  constructor(
    stage: SceneHost,
    readonly gate: Object3D,
    kinds: readonly SystemKind[],
    options: SystemMapOptions = {},
  ) {
    const { depth = 7.5, spread = 5.2 } = options;
    const origin = gate.position.clone().setY(0);
    kinds.forEach((kind, i) => {
      const across = (i - (kinds.length - 1) / 2) * spread;
      const at = origin.clone().addScaledVector(SCREEN_AWAY, depth).addScaledVector(SCREEN_RIGHT, across);
      const node = new SystemNode({ kind });
      node.position.copy(at);
      node.rotation.y = FACE_CAMERA;
      node.visible = false;
      // Branches stop at the edge of the gate and node pads instead of running underneath them.
      const toward = at.clone().sub(origin).normalize();
      const start = origin.clone().addScaledVector(toward, BRANCH_INSET_GATE);
      const end = at.clone().addScaledVector(toward, -BRANCH_INSET_NODE);
      const branch = new Branch(branchCurve(start, end, i % 2 === 0 ? 0.16 : -0.16), NEUTRAL.packet);
      this.nodes.push(node);
      this.branches.push(branch);
      this.routes.push(branchCurve(origin, at, i % 2 === 0 ? 0.16 : -0.16));
      stage.add(branch, node);
    });
    this.untick = stage.onTick((dt) => this.tick(dt));
  }

  /** Back to the unrevealed state: nodes hidden, lines undrawn. */
  hide(): void {
    this.revealed = false;
    this.linesVisible = false;
    this.lineLevel = 0;
    for (const node of this.nodes) {
      node.visible = false;
      node.light = 'off';
    }
    for (const branch of this.branches) branch.drawn = 0;
  }

  /** Set how far node `i` has risen out of the floor (0–1). */
  setRise(i: number, rise: number): void {
    const node = this.nodes[i];
    node.visible = rise > 0.001;
    node.pad.scale.y = node.pad.scale.x * Math.max(rise, 0.001);
    node.emblem.scale.setScalar(EMBLEM_SCALE * Math.max(rise, 0.001));
  }

  /** Line opacity is driven directly during the reveal; afterwards it eases toward `linesVisible`. */
  setLineLevel(level: number): void {
    this.lineLevel = level;
  }

  dispose(): void {
    this.untick();
    for (const node of this.nodes) node.dispose();
    for (const branch of this.branches) branch.dispose();
  }

  private tick(dt: number): void {
    this.time += dt;
    // Emblems idle: a slow bob and a gentle sway, desynchronized per node.
    this.nodes.forEach((node, i) => {
      node.emblem.position.y = EMBLEM_HEIGHT + Math.sin(this.time * 1.4 + i * 2) * 0.03;
      node.emblem.rotation.y = Math.sin(this.time * 0.5 + i) * 0.35;
    });
    if (this.revealed) {
      const k = 1 - Math.exp(-LINE_FADE * dt);
      this.lineLevel = MathUtils.lerp(this.lineLevel, this.linesVisible ? 1 : 0, k);
    }
    for (const branch of this.branches) {
      branch.material.opacity = LINE_OPACITY * this.lineLevel;
      branch.visible = this.lineLevel > 0.01 && branch.drawn > 0;
    }
  }
}
