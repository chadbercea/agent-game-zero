import { type Curve, MathUtils, type Object3D, Vector3 } from 'three';
import { hashSeed, radialMap } from '../core/scatter';
import { BEND_RADIUS, snapToGrid } from '../core/grid';
import { NEUTRAL } from '../core/palette';
import { Branch } from '../primitives/branch/Branch';
import { GridPatch } from '../primitives/branch/GridPatch';
import { roundedPath, trimPolyline } from '../primitives/branch/gridPath';
import type { SystemKind } from '../primitives/node/emblems';
import { EMBLEM_HEIGHT, EMBLEM_SCALE, SystemNode } from '../primitives/node/SystemNode';
import { FACE_CAMERA } from '../stage/spawnDrone';
import type { SceneHost } from '../stage/Stage';

export interface SystemMapOptions {
  /** Layout seed: same seed, same map. Defaults to one derived from the kinds on the map. */
  seed?: number;
  /** Other things on the floor (other gates, home) the map keeps clear of. */
  avoid?: readonly Vector3[];
}

const LINE_FADE = 3;
const BRANCH_INSET_GATE = 1.2;
const BRANCH_INSET_NODE = 0.7;
const LINE_OPACITY = 0.8;

/**
 * The system behind a gate: one node per system, placed procedurally around
 * the gate (see radialMap), each joined to the gate by a branch. Everything
 * sits on the floor's square grid: nodes snap to grid points, and each branch
 * is the shortest grid line from gate to node (see gridRoute: at most one
 * rounded bend, and a fixed bend rule that can never form a pinwheel), over a faint patch of grid that fades to white away from them. Everything starts hidden and
 * only appears when access is granted (see revealMap). Lines are never
 * persistent: they draw in during the reveal, fade out, and come back only
 * while `linesVisible` is set (hover or click) or, per branch, while a
 * sub-agent is out working along it (`setActive`). The faint grid follows
 * only the reveal and hover/click; it never stays for the work.
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
  /** Per branch: a sub-agent is out working along it, so its line stays drawn. */
  private readonly active: boolean[] = [];
  private readonly branchLevel: number[] = [];
  private time = 0;
  private readonly untick: () => void;

  constructor(
    stage: SceneHost,
    readonly gate: Object3D,
    kinds: readonly SystemKind[],
    options: SystemMapOptions = {},
  ) {
    const origin = snapToGrid(gate.position);
    const seed = options.seed ?? hashSeed(kinds.join());
    // Nodes radiate around the gate in seeded directions, each as close as it fits, each on its shortest line.
    const { spots, routes: polylines } = radialMap(origin, kinds.length, { seed, avoid: options.avoid });
    kinds.forEach((kind, i) => {
      const polyline = polylines[i];
      const node = new SystemNode({ kind });
      node.position.copy(spots[i]);
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
      this.active.push(false);
      this.branchLevel.push(0);
      stage.add(patch, branch, node);
    });
    this.untick = stage.onTick((dt) => this.tick(dt));
  }

  /** Back to the unrevealed state: nodes hidden, lines undrawn. */
  hide(): void {
    this.revealed = false;
    this.linesVisible = false;
    this.lineLevel = 0;
    this.active.fill(false);
    this.branchLevel.fill(0);
    for (const node of this.nodes) {
      node.visible = false;
      node.light = 'off';
    }
    for (const branch of this.branches) branch.drawn = 0;
  }

  /** Show the whole map at once (specimens and layout checks), lines included. */
  showAll(): void {
    this.nodes.forEach((_, i) => this.setRise(i, 1));
    for (const branch of this.branches) branch.drawn = 1;
    this.revealed = true;
    this.linesVisible = true;
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
    this.branchLevel.fill(level);
  }

  /** Keep branch `i`'s line drawn while a sub-agent works along it; release to let it fade. */
  setActive(i: number, active: boolean): void {
    this.active[i] = active;
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
    const k = 1 - Math.exp(-LINE_FADE * dt);
    if (this.revealed) {
      this.lineLevel = MathUtils.lerp(this.lineLevel, this.linesVisible ? 1 : 0, k);
    }
    this.branches.forEach((branch, i) => {
      // A line stays while its sub-agent works along it, or while the map is hovered or pinned.
      if (this.revealed) {
        const target = this.linesVisible || this.active[i] ? 1 : 0;
        this.branchLevel[i] = MathUtils.lerp(this.branchLevel[i], target, k);
      }
      branch.material.opacity = LINE_OPACITY * this.branchLevel[i];
      branch.visible = this.branchLevel[i] > 0.01 && branch.drawn > 0;
      // The grid patch comes up with its branch as it draws and fades after the reveal (or hover).
      this.patches[i].opacity = this.lineLevel * branch.drawn;
    });
  }
}
