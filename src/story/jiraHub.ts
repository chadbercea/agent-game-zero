import { type Curve, CylinderGeometry, Group, MeshStandardMaterial, type Object3D, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { BEND_RADIUS, FACE_CAMERA, NODE_FOOTPRINT } from '../core/grid';
import { solid } from '../core/mesh';
import { NEUTRAL } from '../core/palette';
import { seededRandom } from '../core/scatter';
import { distanceToPolyline, reversed, roundedPath, trimPolyline } from '../primitives/branch/gridPath';
import { GraphEdge } from '../primitives/graph/GraphEdge';
import type { SystemKind } from '../primitives/node/emblems';
import type { SystemNode } from '../primitives/node/SystemNode';
import { type Request, Ticket } from '../primitives/ticket/Ticket';
import type { SceneHost } from '../stage/Stage';
import { shoot } from './beam';
import { COLUMN_MAX, type KanbanCard, KanbanBoard } from './jiraBoard';
import { tween, wait } from './timeline';

/** Jira stands a size up from everything around it: it's the quarterback. */
export const HUB_SCALE = 1.35;
/** The hub's plate: a low platform a little wider than the node, so Jira stands on ground of its own. */
export const PLATE = 3;
/** The plate's own height: a low white slab. */
const PLATE_HIGH = 0.06;
/**
 * The corners a plate's cluster may stand in (x, z signs): the two side
 * corners, which the camera sees clear of the node (the back one hides
 * behind it, the front one under its label).
 */
export const CLUSTER_CORNERS: readonly [number, number][] = [
  [1, -1],
  [-1, 1],
];
/** A cluster piece: its footprint as a share of the room beside the node, and its height range (world units). */
const PIECE_WIDE: [number, number] = [0.4, 0.6];
const PIECE_HIGH: [number, number] = [0.22, 0.5];

/**
 * A Teamwork Graph plate: the low white slab a Teamwork Graph app stands on
 * (Jira, Confluence, Code search, Bitbucket), a little wider than its node.
 * In one corner, beside the node, stands a small cluster of one to three
 * plain neutral pieces (blocks, a drum, a short stack). The cluster is
 * picked from the app's name, so each app's plate is always its own and the
 * set reads as one family, without saying what any piece means. That and the
 * plate are what mark these apps as built to stay; no color does.
 * `size` is the plate's width, `nodeWidth` the node standing on it;
 * `corners` narrows where the cluster may stand.
 */
export function graphPlate(size: number, kind: SystemKind, nodeWidth: number, corners = CLUSTER_CORNERS): Group {
  const plate = new Group();
  const shell = new MeshStandardMaterial({ color: NEUTRAL.shell, roughness: 0.5 });
  const shade = new MeshStandardMaterial({ color: NEUTRAL.shellShade, roughness: 0.55 });
  plate.add(solid(new RoundedBoxGeometry(size, PLATE_HIGH, size, 2, 0.03), shell)).position.y = PLATE_HIGH / 2;
  plate.add(cluster(kind, (size - nodeWidth) / 2, size, corners, [shell, shade]));
  return plate;
}

/**
 * One to three pieces in a corner of the plate, in the band of `room`
 * between the node and the plate's edge: at the corner itself, then one
 * step along each edge. Same app, same cluster.
 */
function cluster(kind: SystemKind, room: number, size: number, corners: readonly [number, number][], materials: MeshStandardMaterial[]): Group {
  const random = seededRandom([...kind].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261));
  const between = (r: [number, number]) => r[0] + random() * (r[1] - r[0]);
  const group = new Group();
  const [sx, sz] = corners[Math.floor(random() * corners.length)];
  const corner = new Vector3(sx * (size / 2 - room / 2), PLATE_HIGH, sz * (size / 2 - room / 2));
  const along = room * 0.62;
  const spots = [corner, corner.clone().setX(corner.x - sx * along), corner.clone().setZ(corner.z - sz * along)];
  const count = 1 + Math.floor(random() * 3);
  for (let i = 0; i < count; i++) {
    const wide = room * between(PIECE_WIDE);
    // The first piece, at the corner, stands tallest; the rest stay low beside it.
    const high = i === 0 ? between(PIECE_HIGH) : between([PIECE_HIGH[0] * 0.4, PIECE_HIGH[1] * 0.6]);
    const material = materials[Math.floor(random() * materials.length)];
    const shape = Math.floor(random() * 3);
    const piece =
      shape === 0
        ? solid(new RoundedBoxGeometry(wide, high, wide, 2, Math.min(0.02, high / 3)), material)
        : shape === 1
          ? solid(new CylinderGeometry(wide / 2, wide / 2, high, 24), material)
          : stack(wide, high, material);
    piece.position.copy(spots[i]);
    if (shape !== 2) piece.position.y += high / 2;
    group.add(piece);
  }
  return group;
}

/** A short stack: a block with a smaller one on top. */
function stack(wide: number, high: number, material: MeshStandardMaterial): Group {
  const group = new Group();
  const low = high * 0.55;
  group.add(solid(new RoundedBoxGeometry(wide, low, wide, 2, Math.min(0.02, low / 3)), material)).position.y = low / 2;
  const top = high - low;
  group.add(solid(new RoundedBoxGeometry(wide * 0.6, top, wide * 0.6, 2, Math.min(0.015, top / 3)), material)).position.y = low + top / 2;
  return group;
}

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
 * - It stands a size up on a Teamwork Graph plate of its own, with its own
 *   small cluster in one corner (no screen, no lights: not a gate).
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
  readonly plate: Group;
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
  ) {
    node.scale.setScalar(HUB_SCALE);
    node.emblem.visible = false;
    this.kanban.position.copy(node.position).add(BOARD_OUT).setY(BOARD_AT);
    this.kanban.rotation.y = FACE_CAMERA;
    this.kanban.scale.setScalar(BOARD_SCALE);
    stage.add(this.kanban);
    // Its board floats over the front-left corner, so its cluster stands at the right.
    this.plate = graphPlate(PLATE, 'jira', NODE_FOOTPRINT * HUB_SCALE, [[1, -1]]);
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
   * its last run comes in on, leaving the other sides free.
   */
  async tie(id: string, to: Vector3, arriveFrom?: Vector3, endClear = 0.3, inward = false, along?: readonly Vector3[]): Promise<void> {
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
  private alongRoute(along: readonly Vector3[], endClear: number, inward: boolean): Curve<Vector3> {
    const trimmed = trimPolyline(along.map((p) => p.clone().setY(0)), PLATE / 2, endClear);
    return roundedPath(inward ? trimmed.reverse() : trimmed, BEND_RADIUS);
  }

  private route(end: Vector3, arriveFrom?: Vector3, endClear = 0.3, inward = false): Curve<Vector3> {
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
    const trimmed = trimPolyline(best, PLATE / 2, endClear);
    return roundedPath(inward ? trimmed.reverse() : trimmed, BEND_RADIUS);
  }
}

function easeOutBack(t: number): number {
  const c = 1.6;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}
