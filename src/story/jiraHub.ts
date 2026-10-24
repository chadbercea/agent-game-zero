import { type Curve, type Object3D, Vector3 } from 'three';
import type { Floor } from '../core/floor';
import { BEND_RADIUS, FACE_CAMERA, NODE_FOOTPRINT } from '../core/grid';
import { distanceToPolyline, reversed, roundedPath } from '../primitives/branch/gridPath';
import { GraphEdge } from '../primitives/graph/GraphEdge';
import type { SystemKind } from '../primitives/node/emblems';
import type { SystemNode } from '../primitives/node/SystemNode';
import { type Request, Ticket } from '../primitives/ticket/Ticket';
import type { FloorRect } from '../primitives/unit/unitLayout';
import type { SceneHost } from '../stage/Stage';
import { shoot } from './beam';
import { COLUMN_MAX, type KanbanCard, KanbanBoard } from './jiraBoard';
import { tween, wait } from './timeline';
import { cutToBorders } from './units';

/** Jira stands a size up from everything around it: it's the quarterback. */
export const HUB_SCALE = 1.35;
/** Where lines meet Jira: the edge of its node (it stands a size up, and taller: a permanent system). */
export const JIRA_EDGE = (NODE_FOOTPRINT * HUB_SCALE) / 2;

/** The task board holds this many open tasks at most. */
export const BOARD_MAX = COLUMN_MAX;
/**
 * The kanban board floats out in front of Jira, to the left (toward the
 * camera, so the taller block never hides it; clear of an agent hovering
 * over Jira and of Rovo's way in on the right): how far out, how high its
 * center is, and how big it stands.
 */
const BOARD_OUT = new Vector3(-0.45, 0, 1.6);
const BOARD_AT = 0.85;
const BOARD_SCALE = 0.8;
/** Seconds a finished card stays in Done before it slides off the board. */
const DONE_STAYS: [number, number] = [1.4, 3];
/** A task card riding with a sub-agent is this small (world size). */
const CARRIED_SCALE = 0.3;
const RIDE_SPEED = 5;
/** Seconds a finished card takes to shoot from the copy to its parent. */
const SHOT_SECONDS = 0.6;

/**
 * Jira as the quarterback (Story Narrative): the system of record for
 * everything that happens on the grid.
 *
 * - It stands a size up, and taller: a permanent system (no plate, no color).
 * - Its emblem moves out beside it as a kanban board big enough to read, white cards in To do,
 *   In progress and Done. A new task slides into To do (`addTask`); a
 *   sub-agent takes one (`takeTask`): the card moves to In progress and a
 *   copy of it rides off with the sub-agent.
 * - Whatever a sub-agent spins up for its task is tied back to Jira with a
 *   Graph Line (`tie`); the work rides it home (`report`), and the tie lets
 *   go (`untie`). When the task is done the sub-agent shoots its card,
 *   glowing green, to its parent drone (`finish`), which already talks
 *   two-way with Jira; the board's card then moves to Done.
 */
export class JiraHub {
  /** The kanban board, standing where Jira's emblem was. */
  readonly kanban = new KanbanBoard();
  readonly ties = new Map<string, GraphEdge>();
  /** Ties drawn from the system in to Jira (a system that came up for an agent reaches out to Jira), not out from Jira. */
  readonly inward = new Set<string>();
  /** Tasks finished so far. */
  done = 0;
  /** Where the last finished card landed (its parent drone). */
  landed?: Vector3;
  private readonly untick: () => void;
  /** Which board card each carried task card stands for. */
  private readonly carried = new Map<Ticket, KanbanCard>();

  constructor(
    private readonly stage: SceneHost,
    readonly node: SystemNode,
    /** Things ties route around (the gate, other toolsets). */
    private readonly keepClear: () => Vector3[] = () => [],
    private readonly random: () => number = Math.random,
    /** Jira's unit border (ties set off from it) and the map's floor (ties found on the fly keep off every other unit). */
    private readonly grounded: { border?: FloorRect; floor?: Floor } = {},
  ) {
    node.scale.setScalar(HUB_SCALE);
    node.emblem.visible = false;
    this.kanban.position.copy(node.position).add(BOARD_OUT).setY(BOARD_AT);
    this.kanban.rotation.y = FACE_CAMERA;
    this.kanban.scale.setScalar(BOARD_SCALE);
    stage.add(this.kanban);
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
    this.kanban.visible = false;
  }

  /** Jira grows in. */
  async appear(): Promise<void> {
    this.node.visible = true;
    await tween(this.stage, 0.5, (t) => {
      const k = Math.max(0.001, easeOutBack(t));
      this.node.scale.setScalar(HUB_SCALE * k);
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

  /** A new task comes into Jira: a white card (red for an incident) slides into To do. No room: it waits (returns false). */
  async addTask(incident = false): Promise<boolean> {
    if (this.board.length >= BOARD_MAX) return false;
    this.kanban.addCard(incident);
    await wait(this.stage, 0.3);
    return true;
  }

  /**
   * A sub-agent takes the oldest open task: its card moves to In progress,
   * and a copy lifts off the board and rides with the sub-agent (on `carrier`).
   */
  async takeTask(carrier: Object3D, handedBy?: Object3D, request: Request = { key: 'DEMO', title: 'Task' }): Promise<Ticket | null> {
    const card = this.board[0];
    if (!card) return null;
    // Handed over by the parent (`handedBy`, Rovo) when given; otherwise it lifts straight off the board.
    const from = (handedBy ?? card.mesh).getWorldPosition(new Vector3());
    this.kanban.moveCard(card, 1);
    const ticket = new Ticket(request, { label: false });
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

  /** The task is done: the copy shoots its card, glowing green, to `to` (its parent, Rovo); then Done on the board. */
  async finish(card: Ticket, to: Object3D): Promise<void> {
    // The copy shoots its finished ticket to its parent (Rovo, already talking two-way with Jira), not to the base.
    const from = card.getWorldPosition(new Vector3());
    const size = card.getWorldScale(new Vector3()).x;
    card.removeFromParent();
    this.stage.add(card);
    card.position.copy(from);
    card.scale.setScalar(size);
    card.resolve();
    card.glow = 1;
    const target = new Vector3();
    await tween(this.stage, SHOT_SECONDS, (t) => {
      to.getWorldPosition(target);
      card.position.lerpVectors(from, target, t * t * (3 - 2 * t));
      card.position.y += Math.sin(t * Math.PI) * 0.6;
      card.glow = 1;
    });
    this.landed = card.position.clone();
    // Into Rovo: it glows green and goes; Rovo relays it to Jira over their link, and the board catches up.
    await tween(this.stage, 0.35, (t) => {
      card.position.copy(to.getWorldPosition(target));
      card.scale.setScalar(Math.max(0.001, size * (1 - t)));
      card.glow = 1;
      card.opacity = 1 - t;
    });
    this.node.light = 'working';
    card.dispose();
    const onBoard = this.carried.get(card);
    this.carried.delete(card);
    this.done++;
    if (onBoard) void this.completeOnBoard(onBoard);
  }

  /**
   * Tie a toolset into Jira: a Graph Line draws from Jira out to `to` and
   * stays until `untie`. `arriveFrom` (a grid direction from `to`) is the side
   * its last run comes in on, leaving the other sides free. It ends `endClear`
   * short of `to`, or on its unit's border when given one.
   */
  async tie(id: string, to: Vector3, arriveFrom?: Vector3, endClear: number | FloorRect = 0.3, inward = false, along?: readonly Vector3[]): Promise<void> {
    // Along a laid-out route (Jira → system, shortest and its own) when there is one; otherwise the hub finds one.
    const edge = new GraphEdge(along ? this.alongRoute(along, endClear, inward) : this.route(to, arriveFrom, endClear, inward));
    this.ties.set(id, edge);
    if (inward) this.inward.add(id);
    this.stage.add(edge);
    await tween(this.stage, 0.8, (t) => (edge.drawn = t));
  }

  /** Something rides the tie home into Jira: that tool's product (`kind`), or plain status (a gray packet) if none. */
  async report(id: string, kind?: SystemKind): Promise<void> {
    const edge = this.ties.get(id);
    if (edge) await shoot(this.stage, this.inward.has(id) ? edge.path : reversed(edge.path), RIDE_SPEED, undefined, kind);
  }

  /** The toolset is done: its tie draws back and goes. */
  async untie(id: string): Promise<void> {
    const edge = this.ties.get(id);
    if (!edge) return;
    this.ties.delete(id);
    this.inward.delete(id);
    await tween(this.stage, 0.6, (t) => (edge.drawn = Math.max(0.001, 1 - t)));
    edge.dispose();
  }

  dispose(): void {
    this.untick();
    this.kanban.dispose();
    for (const t of this.carried.keys()) t.dispose();
    for (const e of this.ties.values()) e.dispose();
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
   * Jira → a point along the grid, from its node's edge, round whichever
   * corner (or a three-leg detour) is shortest while staying clear of what it
   * must (the gate, other toolsets).
   */
  private alongRoute(along: readonly Vector3[], endClear: number | FloorRect, inward: boolean): Curve<Vector3> {
    const trimmed = cutToBorders([...along], this.grounded.border ?? JIRA_EDGE + 0.05, endClear);
    return roundedPath(inward ? trimmed.reverse() : trimmed, BEND_RADIUS);
  }

  private route(end: Vector3, arriveFrom?: Vector3, endClear: number | FloorRect = 0.3, inward = false): Curve<Vector3> {
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
    // Never across another unit: of the ways the floor takes, the shortest clear one.
    const { floor } = this.grounded;
    const onFloor = floor ? clean.filter((l) => floor.lineFits(l)) : clean;
    const ways = onFloor.length ? onFloor : clean;
    const ok = ways.filter((l) => clear(l) >= ROOM);
    const best = ok.length ? ok.sort((a, b) => length(a) - length(b))[0] : ways.sort((a, b) => clear(b) - clear(a))[0];
    const trimmed = cutToBorders(best, this.grounded.border ?? JIRA_EDGE + 0.05, endClear);
    return roundedPath(inward ? trimmed.reverse() : trimmed, BEND_RADIUS);
  }
}

function easeOutBack(t: number): number {
  const c = 1.6;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}
