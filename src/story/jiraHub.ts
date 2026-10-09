import { type Curve, Group, MeshStandardMaterial, type Object3D, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { BEND_RADIUS, FACE_CAMERA } from '../core/grid';
import { solid } from '../core/mesh';
import { NEUTRAL } from '../core/palette';
import { distanceToPolyline, reversed, roundedPath, trimPolyline } from '../primitives/branch/gridPath';
import { GRAPH_COLOR, GraphEdge } from '../primitives/graph/GraphEdge';
import type { SystemKind } from '../primitives/node/emblems';
import type { SystemNode } from '../primitives/node/SystemNode';
import { Ticket } from '../primitives/ticket/Ticket';
import type { SceneHost } from '../stage/Stage';
import { shoot } from './beam';
import { COLUMN_MAX, type KanbanCard, KanbanBoard } from './jiraBoard';
import { tween, wait } from './timeline';

/** Jira stands a size up from everything around it: it's the quarterback. */
export const HUB_SCALE = 1.35;
/** The hub's plate: a low platform a little wider than the node, so Jira stands on ground of its own. */
export const PLATE = 3;
/** The task board holds this many open tasks at most. */
export const BOARD_MAX = COLUMN_MAX;
/**
 * The kanban board floats over the plate's front-left corner, beside the node
 * (never over it, and clear of an agent hovering over Jira): how far out,
 * how high its center is, and how big it stands.
 */
const BOARD_OUT = new Vector3(-0.95, 0, 0.95);
const BOARD_AT = 0.85;
const BOARD_SCALE = 0.8;
const CARD_SCALE = 0.4;
/** Seconds a finished card stays in Done before it slides off the board. */
const DONE_STAYS: [number, number] = [1.4, 3];
/** A task card riding with a sub-agent is this small (world size). */
const CARRIED_SCALE = 0.3;
const RIDE_SPEED = 5;

/**
 * Jira as the quarterback (Story Narrative): the system of record for
 * everything that happens on the grid.
 *
 * - It stands a size up on a low plate of its own with a Teamwork Graph blue
 *   edge (no screen, no lights: not a gate).
 * - Its emblem moves out beside it as a kanban board big enough to read, white cards in To do,
 *   In progress and Done. A new task slides into To do (`addTask`); a
 *   sub-agent takes one (`takeTask`): the card moves to In progress and a
 *   copy of it rides off with the sub-agent.
 * - Whatever a sub-agent spins up for its task is tied back to Jira with a
 *   Graph Line (`tie`); the work rides it home (`report`), the task comes
 *   back done (`finish`: it glows green and clears), and the tie lets go
 *   (`untie`).
 */
export class JiraHub {
  readonly plate: Group;
  /** The kanban board, standing where Jira's emblem was. */
  readonly kanban = new KanbanBoard();
  readonly ties = new Map<string, GraphEdge>();
  /** Tasks finished so far. */
  done = 0;
  private readonly untick: () => void;
  /** Which board card each carried task card stands for. */
  private readonly carried = new Map<Ticket, KanbanCard>();

  constructor(
    private readonly stage: SceneHost,
    readonly node: SystemNode,
    /** Things ties route around (the gate, other toolsets). */
    private readonly keepClear: () => Vector3[] = () => [],
    private readonly random: () => number = Math.random,
  ) {
    node.scale.setScalar(HUB_SCALE);
    node.emblem.visible = false;
    this.kanban.position.copy(node.position).add(BOARD_OUT).setY(BOARD_AT);
    this.kanban.rotation.y = FACE_CAMERA;
    this.kanban.scale.setScalar(BOARD_SCALE);
    stage.add(this.kanban);
    this.plate = new Group();
    const shell = new MeshStandardMaterial({ color: NEUTRAL.shell, roughness: 0.5 });
    const edge = new MeshStandardMaterial({ color: GRAPH_COLOR, emissive: GRAPH_COLOR, emissiveIntensity: 0.5, roughness: 0.4 });
    this.plate.add(solid(new RoundedBoxGeometry(PLATE, 0.06, PLATE, 2, 0.03), shell)).position.y = 0.03;
    this.plate.add(solid(new RoundedBoxGeometry(PLATE + 0.08, 0.025, PLATE + 0.08, 2, 0.012), edge)).position.y = 0.012;
    this.plate.position.copy(node.position);
    stage.add(this.plate);
    this.untick = stage.onTick((dt) => {
      this.kanban.update(dt);
      for (const t of this.carried.keys()) t.update(dt);
      for (const e of this.ties.values()) e.update(dt);
    });
  }

  /**
   * The hub comes in stages (progressive): `hide()` it all, then Jira itself
   * grows in (`appear`), and its kanban board only once work starts (`showBoard`).
   */
  hide(): void {
    this.node.visible = false;
    this.plate.visible = false;
    this.kanban.visible = false;
  }

  /** Jira and its plate grow in. */
  async appear(): Promise<void> {
    this.node.visible = true;
    this.plate.visible = true;
    await tween(this.stage, 0.5, (t) => {
      const k = Math.max(0.001, easeOutBack(t));
      this.node.scale.setScalar(HUB_SCALE * k);
      this.plate.scale.setScalar(k);
    });
  }

  /** The kanban board grows in beside Jira. */
  async showBoard(): Promise<void> {
    this.kanban.visible = true;
    await tween(this.stage, 0.45, (t) => this.kanban.scale.setScalar(Math.max(0.001, BOARD_SCALE * easeOutBack(t))));
  }

  /** Open tasks: the cards in To do, oldest first. */
  get board(): readonly KanbanCard[] {
    return this.kanban.columns[0];
  }

  /** A new task comes into Jira: a white card slides into To do. No room: it waits (returns false). */
  async addTask(): Promise<boolean> {
    if (this.board.length >= BOARD_MAX) return false;
    this.kanban.addCard();
    await wait(this.stage, 0.3);
    return true;
  }

  /**
   * A sub-agent takes the oldest open task: its card moves to In progress,
   * and a copy lifts off the board and rides with the sub-agent (on `carrier`).
   */
  async takeTask(carrier: Object3D): Promise<Ticket | null> {
    const card = this.board[0];
    if (!card) return null;
    const from = card.mesh.getWorldPosition(new Vector3());
    this.kanban.moveCard(card, 1);
    const ticket = new Ticket({ key: 'DEMO', title: 'Task' }, { label: false });
    this.carried.set(ticket, card);
    carrier.add(ticket);
    carrier.worldToLocal(from);
    const to = new Vector3(0, 0.15, 0);
    const scale = CARRIED_SCALE / Math.max(carrier.getWorldScale(new Vector3()).x, 0.001);
    await tween(this.stage, 0.45, (t) => {
      ticket.position.lerpVectors(from, to, t * t * (3 - 2 * t));
      ticket.scale.setScalar(Math.max(0.001, scale * t));
    });
    return ticket;
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
    const onBoard = this.carried.get(card);
    this.carried.delete(card);
    this.done++;
    if (onBoard) void this.completeOnBoard(onBoard);
  }

  /**
   * Tie a toolset into Jira: a Graph Line draws from Jira out to `to` and
   * stays until `untie`. `arriveFrom` (a grid direction from `to`) is the side
   * its last run comes in on, leaving the other sides free.
   */
  async tie(id: string, to: Vector3, arriveFrom?: Vector3, endClear = 0.3): Promise<void> {
    const edge = new GraphEdge(this.route(to, arriveFrom, endClear));
    this.ties.set(id, edge);
    this.stage.add(edge);
    await tween(this.stage, 0.8, (t) => (edge.drawn = t));
  }

  /** Something rides the tie home into Jira: that tool's product (`kind`), or plain status (a gray packet) if none. */
  async report(id: string, kind?: SystemKind): Promise<void> {
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
    this.kanban.dispose();
    for (const t of this.carried.keys()) t.dispose();
    for (const e of this.ties.values()) e.dispose();
    this.plate.removeFromParent();
  }

  /** On the board, the task's card moves to Done, glowing green, stays a beat, then slides off. */
  private async completeOnBoard(card: KanbanCard): Promise<void> {
    this.kanban.moveCard(card, 2);
    const done = this.kanban.columns[2];
    if (done.length > COLUMN_MAX - 1) this.kanban.removeCard(done[0]);
    await wait(this.stage, DONE_STAYS[0] + this.random() * (DONE_STAYS[1] - DONE_STAYS[0]));
    this.kanban.removeCard(card);
  }

  /**
   * Jira → a point along the grid, from the plate's edge, round whichever
   * corner (or a three-leg detour) is shortest while staying clear of what it
   * must (the gate, other toolsets).
   */
  private route(end: Vector3, arriveFrom?: Vector3, endClear = 0.3): Curve<Vector3> {
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
    const all = options.map((l) => l.filter((p, i) => i === 0 || p.distanceTo(l[i - 1]) > 1e-6));
    const arrives = (l: Vector3[]) => !arriveFrom || l[l.length - 2].clone().sub(end).normalize().dot(arriveFrom) > 0.999;
    const clean = all.some(arrives) ? all.filter(arrives) : all;
    const others = this.keepClear().filter((p) => p.distanceTo(end) > 1.6 && p.distanceTo(from) > 0.5);
    const clear = (line: Vector3[]) => Math.min(Infinity, ...others.map((p) => distanceToPolyline(p.x, p.z, line)));
    const length = (line: Vector3[]) => line.reduce((sum, p, i) => sum + (i ? p.distanceTo(line[i - 1]) : 0), 0);
    const ROOM = 0.95;
    const ok = clean.filter((l) => clear(l) >= ROOM);
    const best = ok.length ? ok.sort((a, b) => length(a) - length(b))[0] : clean.sort((a, b) => clear(b) - clear(a))[0];
    return roundedPath(trimPolyline(best, PLATE / 2, endClear), BEND_RADIUS);
  }
}

function easeOutBack(t: number): number {
  const c = 1.6;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}
