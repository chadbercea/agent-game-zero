import { type Curve, Group, MeshStandardMaterial, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { BEND_RADIUS, NODE_FOOTPRINT } from '../core/grid';
import { solid } from '../core/mesh';
import { NEUTRAL } from '../core/palette';
import { gridRoute } from '../core/scatter';
import { distanceToPolyline, reversed, roundedPath, trimPolyline } from '../primitives/branch/gridPath';
import { GRAPH_COLOR, GraphEdge } from '../primitives/graph/GraphEdge';
import type { SystemKind } from '../primitives/node/emblems';
import type { SystemNode } from '../primitives/node/SystemNode';
import { Ticket } from '../primitives/ticket/Ticket';
import type { SceneHost } from '../stage/Stage';
import { shoot } from './beam';
import { tween } from './timeline';

/** Jira stands a size up from the tools around it: it's the hub. */
export const HUB_SCALE = 1.35;
/** The hub's plate: a low platform a little wider than the node, so Jira stands on ground of its own. */
const PLATE = 2.3;
/** The rack holds this many tickets; past that, the oldest goes as a new one comes in. */
export const RACK_MAX = 8;
const CARD_SCALE = 0.4;
/** Space between cards in the rack. */
const CARD_GAP = 0.27;
const RIDE_SPEED = 5;

/**
 * Jira as a hub of its own (Story Narrative). Jira is where work is
 * collected and tracked, and the tools around it tie back into it:
 *
 * - It stands a size up, on a low plate of its own with a Teamwork Graph
 *   blue edge, so it reads as the center of its system (not a gate: no
 *   screen, no lights).
 * - Behind it, a rack of ticket cards fills as tickets come in (`collect`):
 *   the collection.
 * - Ties: when a tool it works with comes up (Bitbucket, Confluence), a
 *   Graph Line draws from Jira to it and stays (`tie`), always flowing; work
 *   on that tool rides the tie back into Jira and lands in the rack
 *   (`report`).
 */
export class JiraHub {
  readonly plate: Group;
  /** Tickets in the rack, oldest first. */
  readonly rack: Ticket[] = [];
  readonly ties = new Map<SystemKind, GraphEdge>();
  private readonly untick: () => void;

  /** `keepClear`: things the ties route around (the gate). */
  constructor(
    private readonly stage: SceneHost,
    readonly node: SystemNode,
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
      for (const t of this.rack) t.update(dt);
      for (const e of this.ties.values()) e.update(dt);
    });
  }

  /** A ticket comes into Jira: a new card pops into the rack (the oldest makes room if it's full). */
  async collect(): Promise<void> {
    const { stage } = this;
    const card = new Ticket({ key: 'DEMO', title: 'Issue' }, { label: false });
    card.scale.setScalar(0.001);
    this.rack.push(card);
    stage.add(card);
    if (this.rack.length > RACK_MAX) {
      const old = this.rack.shift()!;
      void tween(stage, 0.3, (t) => old.scale.setScalar(Math.max(0.001, CARD_SCALE * (1 - t)))).then(() => old.dispose());
    }
    this.placeRack();
    await tween(stage, 0.3, (t) => card.scale.setScalar(Math.max(0.001, CARD_SCALE * t)));
  }

  /** Tie a tool into Jira: a Graph Line draws from Jira out to it and stays. Already tied: nothing to do. */
  async tie(to: SystemNode): Promise<void> {
    if (this.ties.has(to.kind)) return;
    const edge = new GraphEdge(this.route(to));
    this.ties.set(to.kind, edge);
    this.stage.add(edge);
    await tween(this.stage, 0.9, (t) => (edge.drawn = t));
  }

  /** Work on a tied tool reports into Jira: its product rides the tie back, and a ticket lands in the rack. */
  async report(kind: SystemKind): Promise<void> {
    const edge = this.ties.get(kind);
    if (!edge) return;
    await shoot(this.stage, reversed(edge.path), RIDE_SPEED, undefined, kind);
    await this.collect();
  }

  dispose(): void {
    this.untick();
    for (const t of this.rack.splice(0)) t.dispose();
    for (const e of this.ties.values()) e.dispose();
    this.plate.removeFromParent();
  }

  /** The rack: cards in a row along the back edge of the plate, facing the camera. */
  private placeRack(): void {
    const at = this.node.position;
    this.rack.forEach((card, i) => {
      const k = i - (RACK_MAX - 1) / 2;
      // Along the plate's back edge (up the screen), spread screen-left to screen-right.
      card.position.set(at.x - 0.95 + k * CARD_GAP, 0, at.z - 0.95 - k * CARD_GAP);
    });
  }

  /**
   * Jira → tool along the grid, from the hub plate's edge to the tool's pad,
   * round whichever corner keeps it furthest from what it must stay clear of
   * (the gate, the other tools), so a tie never runs across them.
   */
  private route(to: SystemNode): Curve<Vector3> {
    const from = this.node.position;
    const end = to.position;
    // Candidates: the two L-shapes, and three-leg routes that step out to a parallel grid line first.
    const options: Vector3[][] = [gridRoute(from, end), gridRoute(end, from).reverse()];
    for (let k = -3; k <= 3; k += 0.5) {
      const midX = Math.round((from.x + end.x) / 2 + k);
      const midZ = Math.round((from.z + end.z) / 2 + k);
      options.push([from.clone(), new Vector3(midX, 0, from.z), new Vector3(midX, 0, end.z), end.clone()]);
      options.push([from.clone(), new Vector3(from.x, 0, midZ), new Vector3(end.x, 0, midZ), end.clone()]);
    }
    const others = this.keepClear().filter((p) => p.distanceTo(end) > 1e-3 && p.distanceTo(from) > 1e-3);
    const clear = (line: Vector3[]) => Math.min(Infinity, ...others.map((p) => distanceToPolyline(p.x, p.z, line)));
    const length = (line: Vector3[]) => line.reduce((sum, p, i) => sum + (i ? p.distanceTo(line[i - 1]) : 0), 0);
    // Clear of every pad (gate, tools) by at least this much counts as clear; among those, the shortest wins.
    const ROOM = 0.95;
    const ok = options.filter((l) => clear(l) >= ROOM);
    const best = ok.length ? ok.sort((a, b) => length(a) - length(b))[0] : options.sort((a, b) => clear(b) - clear(a))[0];
    return roundedPath(trimPolyline(best, PLATE / 2, NODE_FOOTPRINT / 2), BEND_RADIUS);
  }
}
