import { type Curve, Group, MeshStandardMaterial, type Object3D, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { BEND_RADIUS } from '../core/grid';
import { solid } from '../core/mesh';
import { NEUTRAL } from '../core/palette';
import { distanceToPolyline, reversed, roundedPath, trimPolyline } from '../primitives/branch/gridPath';
import { GRAPH_COLOR, GraphEdge } from '../primitives/graph/GraphEdge';
import type { SystemKind } from '../primitives/node/emblems';
import type { SystemNode } from '../primitives/node/SystemNode';
import { Ticket } from '../primitives/ticket/Ticket';
import type { SceneHost } from '../stage/Stage';
import { shoot } from './beam';
import { tween } from './timeline';

/** Jira stands a size up from everything around it: it's the quarterback. */
export const HUB_SCALE = 1.35;
/** The hub's plate: a low platform a little wider than the node, so Jira stands on ground of its own. */
export const PLATE = 2.3;
/** The task board holds this many open tasks at most. */
export const BOARD_MAX = 6;
const CARD_SCALE = 0.4;
const CARD_GAP = 0.3;
/** A task card riding with a sub-agent is this small (world size). */
const CARRIED_SCALE = 0.3;
const RIDE_SPEED = 5;

/**
 * Jira as the quarterback (Story Narrative): the system of record for
 * everything that happens on the grid.
 *
 * - It stands a size up on a low plate of its own with a Teamwork Graph blue
 *   edge (no screen, no lights: not a gate).
 * - Behind it, a task board of white cards: open tasks (`addTask`). A
 *   sub-agent takes one (`takeTask`) and carries it off.
 * - Whatever a sub-agent spins up for its task is tied back to Jira with a
 *   Graph Line (`tie`); the work rides it home (`report`), the task comes
 *   back done (`finish`: it glows green and clears), and the tie lets go
 *   (`untie`).
 */
export class JiraHub {
  readonly plate: Group;
  /** Open tasks on the board, oldest first. */
  readonly board: Ticket[] = [];
  readonly ties = new Map<string, GraphEdge>();
  /** Tasks finished so far. */
  done = 0;
  private readonly untick: () => void;

  constructor(
    private readonly stage: SceneHost,
    readonly node: SystemNode,
    /** Things ties route around (the gate, other toolsets). */
    private readonly keepClear: () => Vector3[] = () => [],
  ) {
    node.scale.setScalar(HUB_SCALE);
    this.plate = new Group();
    const shell = new MeshStandardMaterial({ color: NEUTRAL.shell, roughness: 0.5 });
    const edge = new MeshStandardMaterial({ color: GRAPH_COLOR, emissive: GRAPH_COLOR, emissiveIntensity: 0.5, roughness: 0.4 });
    this.plate.add(solid(new RoundedBoxGeometry(PLATE, 0.06, PLATE, 2, 0.03), shell)).position.y = 0.03;
    this.plate.add(solid(new RoundedBoxGeometry(PLATE + 0.08, 0.025, PLATE + 0.08, 2, 0.012), edge)).position.y = 0.012;
    this.plate.position.copy(node.position);
    stage.add(this.plate);
    this.untick = stage.onTick((dt) => {
      for (const t of this.board) t.update(dt);
      for (const e of this.ties.values()) e.update(dt);
    });
  }

  /** A new task comes into Jira: a white card pops onto the board. No room: it waits (returns false). */
  async addTask(): Promise<boolean> {
    if (this.board.length >= BOARD_MAX) return false;
    const card = new Ticket({ key: 'DEMO', title: 'Task' }, { label: false });
    card.scale.setScalar(0.001);
    this.board.push(card);
    this.stage.add(card);
    this.placeBoard();
    await tween(this.stage, 0.3, (t) => card.scale.setScalar(Math.max(0.001, CARD_SCALE * t)));
    return true;
  }

  /** A sub-agent takes the oldest open task: the card lifts off the board and rides with it (on `carrier`). */
  async takeTask(carrier: Object3D): Promise<Ticket | null> {
    const card = this.board.shift();
    if (!card) return null;
    this.placeBoard();
    const from = card.getWorldPosition(new Vector3());
    card.removeFromParent();
    carrier.add(card);
    carrier.worldToLocal(from);
    const to = new Vector3(0, 0.15, 0);
    const start = card.scale.x;
    const end = CARRIED_SCALE / Math.max(carrier.getWorldScale(new Vector3()).x, 0.001);
    await tween(this.stage, 0.45, (t) => {
      card.position.lerpVectors(from, to, t * t * (3 - 2 * t));
      card.scale.setScalar(start + (end - start) * t);
    });
    return card;
  }

  /** The task comes home done: the card glows green over Jira and clears. */
  async finish(card: Ticket): Promise<void> {
    const at = card.getWorldPosition(new Vector3());
    card.removeFromParent();
    this.stage.add(card);
    card.scale.setScalar(CARD_SCALE);
    const over = this.node.position.clone();
    const from = at.setY(0);
    card.glow = 1;
    await tween(this.stage, 0.5, (t) => {
      card.position.lerpVectors(from, over, t * t * (3 - 2 * t));
      card.glow = 1;
    });
    this.node.light = 'working';
    await tween(this.stage, 0.5, (t) => {
      card.glow = 1;
      card.opacity = 1 - t;
    });
    card.dispose();
    this.done++;
  }

  /** Tie a toolset into Jira: a Graph Line draws from Jira out to `to` and stays until `untie`. */
  async tie(id: string, to: Vector3): Promise<void> {
    const edge = new GraphEdge(this.route(to));
    this.ties.set(id, edge);
    this.stage.add(edge);
    await tween(this.stage, 0.8, (t) => (edge.drawn = t));
  }

  /** Work rides the tie home into Jira, as that tool's product. */
  async report(id: string, kind: SystemKind): Promise<void> {
    const edge = this.ties.get(id);
    if (edge) await shoot(this.stage, reversed(edge.path), RIDE_SPEED, undefined, kind);
  }

  /** The toolset is done: its tie draws back and goes. */
  async untie(id: string): Promise<void> {
    const edge = this.ties.get(id);
    if (!edge) return;
    this.ties.delete(id);
    await tween(this.stage, 0.6, (t) => (edge.drawn = Math.max(0.001, 1 - t)));
    edge.dispose();
  }

  dispose(): void {
    this.untick();
    for (const t of this.board.splice(0)) t.dispose();
    for (const e of this.ties.values()) e.dispose();
    this.plate.removeFromParent();
  }

  /** The board: open tasks in a row along the back edge of the plate, facing the camera. */
  private placeBoard(): void {
    const at = this.node.position;
    this.board.forEach((card, i) => {
      const k = i - (BOARD_MAX - 1) / 2;
      card.position.set(at.x - 0.95 + k * CARD_GAP, 0, at.z - 0.95 - k * CARD_GAP);
    });
  }

  /**
   * Jira → a point along the grid, from the plate's edge, round whichever
   * corner (or a three-leg detour) is shortest while staying clear of what it
   * must (the gate, other toolsets).
   */
  private route(end: Vector3): Curve<Vector3> {
    const from = this.node.position;
    const options: Vector3[][] = [
      [from.clone(), new Vector3(end.x, 0, from.z), end.clone()],
      [from.clone(), new Vector3(from.x, 0, end.z), end.clone()],
    ];
    for (let k = -3; k <= 3; k += 0.5) {
      const midX = Math.round((from.x + end.x) / 2 + k);
      const midZ = Math.round((from.z + end.z) / 2 + k);
      options.push([from.clone(), new Vector3(midX, 0, from.z), new Vector3(midX, 0, end.z), end.clone()]);
      options.push([from.clone(), new Vector3(from.x, 0, midZ), new Vector3(end.x, 0, midZ), end.clone()]);
    }
    const clean = options.map((l) => l.filter((p, i) => i === 0 || p.distanceTo(l[i - 1]) > 1e-6));
    const others = this.keepClear().filter((p) => p.distanceTo(end) > 1.6 && p.distanceTo(from) > 0.5);
    const clear = (line: Vector3[]) => Math.min(Infinity, ...others.map((p) => distanceToPolyline(p.x, p.z, line)));
    const length = (line: Vector3[]) => line.reduce((sum, p, i) => sum + (i ? p.distanceTo(line[i - 1]) : 0), 0);
    const ROOM = 0.95;
    const ok = clean.filter((l) => clear(l) >= ROOM);
    const best = ok.length ? ok.sort((a, b) => length(a) - length(b))[0] : clean.sort((a, b) => clear(b) - clear(a))[0];
    return roundedPath(trimPolyline(best, PLATE / 2, 0.3), BEND_RADIUS);
  }
}
