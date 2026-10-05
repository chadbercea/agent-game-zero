import { type Curve, MathUtils, type Object3D, Vector3 } from 'three';
import { BEND_RADIUS, GRID, snapToGrid } from '../core/grid';
import { NEUTRAL } from '../core/palette';
import { Branch } from '../primitives/branch/Branch';
import { GridPatch } from '../primitives/branch/GridPatch';
import { roundedPath, trimPolyline } from '../primitives/branch/gridPath';
import type { SystemKind } from '../primitives/node/emblems';
import { EMBLEM_HEIGHT, EMBLEM_SCALE, SystemNode } from '../primitives/node/SystemNode';
import { FACE_CAMERA } from '../stage/spawnDrone';
import type { SceneHost } from '../stage/Stage';

export interface SystemMapOptions {
  /** How far behind the gate (on screen: straight above it) the middle node sits, per world axis. */
  depth?: number;
  /** How far apart neighbouring nodes sit across the screen, per world axis. */
  spread?: number;
}

const LINE_FADE = 3;
const BRANCH_INSET_GATE = 1.2;
const BRANCH_INSET_NODE = 0.7;
const LINE_OPACITY = 0.8;

/**
 * The system behind a gate: one node per system, fanned out above the gate on
 * screen, each joined to the gate by a branch. Everything sits on the floor's
 * square grid: nodes snap to grid points, and branches run only along the
 * grid axes (the isometric diagonals on screen) with rounded right-angle
 * bends, over a faint patch of grid that fades to white away from the path. Everything starts hidden and
 * only appears when access is granted (see revealMap). Lines are never
 * persistent: they draw in during the reveal, fade out, and come back only
 * while `linesVisible` is set (hover or click).
 */
export class SystemMap {
  readonly nodes: SystemNode[] = [];
  readonly branches: Branch[] = [];
  /** Faint grid under each branch, fading with distance from it. */
  readonly patches: GridPatch[] = [];
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
    const { depth = 6, spread = 3 } = options;
    const origin = snapToGrid(gate.position);
    kinds.forEach((kind, i) => {
      const polyline = gridRoute(origin, i - (kinds.length - 1) / 2, depth, spread);
      const at = polyline[polyline.length - 1];
      const node = new SystemNode({ kind });
      node.position.copy(at);
      node.rotation.y = FACE_CAMERA;
      node.visible = false;
      // The drawn line stops at the edges of the gate and node pads instead of running underneath them.
      const drawn = trimPolyline(polyline, BRANCH_INSET_GATE, BRANCH_INSET_NODE);
      const branch = new Branch(roundedPath(drawn, BEND_RADIUS), NEUTRAL.packet);
      const patch = new GridPatch(drawn);
      this.nodes.push(node);
      this.branches.push(branch);
      this.patches.push(patch);
      this.routes.push(roundedPath(polyline, BEND_RADIUS));
      stage.add(patch, branch, node);
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
    for (const patch of this.patches) patch.dispose();
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
    this.branches.forEach((branch, i) => {
      branch.material.opacity = LINE_OPACITY * this.lineLevel;
      branch.visible = this.lineLevel > 0.01 && branch.drawn > 0;
      // The grid patch comes up with its branch as it draws, and leaves with the lines.
      this.patches[i].opacity = this.lineLevel * branch.drawn;
    });
  }
}

/**
 * The grid route from the gate to one node, as an axis-aligned polyline.
 * `slot` is the node's place across the screen (…-1 left, 0 middle, 1 right…).
 * Nodes sit up and back from the gate along the isometric diagonals. Left
 * nodes leave along −X and turn into −Z; right nodes leave along −Z and turn
 * into −X; the middle one leaves along −X. Each route leaves the gate on its
 * own lane (one grid line apart) so no two branches overlap.
 */
export function gridRoute(origin: Vector3, slot: number, depth: number, spread: number): Vector3[] {
  const at = new Vector3(origin.x - depth + slot * spread, 0, origin.z - depth - slot * spread);
  const lane = GRID * Math.max(1, Math.abs(slot));
  if (slot > 0) {
    // Right: out along −Z on a lane to the +X side, then across in −X.
    const start = new Vector3(origin.x + lane, 0, origin.z);
    return [origin.clone(), start, new Vector3(start.x, 0, at.z), at];
  }
  // Left and middle: out along −X, on a lane to the +Z side (left) or −Z side (middle).
  const start = new Vector3(origin.x, 0, origin.z + (slot < 0 ? lane : -lane));
  return [origin.clone(), start, new Vector3(at.x, 0, start.z), at];
}
