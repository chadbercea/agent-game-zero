import { seededRandom } from '../core/scatter';
import type { Drone } from '../primitives/drone/Drone';
import { SYSTEM_NAME, type SystemKind } from '../primitives/node/emblems';
import type { SceneHost } from '../stage/Stage';
import { DEMO_1, WorkLedger } from './ledger';
import type { TwoActScene } from './twoActs';

/** The two systems on the grid, as the ledger and hover cards name them. */
export const TOOLS = 'Third-party tools';
export const ATLASSIAN = 'Atlassian';

/** Someone on the grid who can be working right now. */
export interface Worker {
  id: string;
  drone: Drone;
  /** For a sub-agent: its parent agent's id. */
  parentId?: string;
  /** The node it's working at, if any. */
  nodeId?: string;
}

/** Seconds between pieces of work a working sub-agent finishes (each gets its own pace within this range). */
const SUB_PACE: [number, number] = [1.3, 2.4];
/** A working parent agent finishes its own pieces (reviews, hand-offs) more slowly. */
const AGENT_PACE: [number, number] = [2.5, 4];
/** Everyone else's work at each node: the hundreds of other things getting done. */
const BACKGROUND_PACE: [number, number] = [1.8, 4.5];
const ARRIVAL_PACE: [number, number] = [2.5, 6];
/** Chance that finishing a piece of work brings another request into the same queues: work keeps coming. */
const REFILL = 0.9;

export const nodeId = (kind: SystemKind) => `node:${kind}`;
export const subId = (kind: SystemKind) => `sub:${kind}`;
export const D3V1N_ID = 'agent:d3v1n';
export const ROVO_ID = 'agent:rovo';

/**
 * Volume of work, moving with the story. Every node keeps busy with
 * everyone else's work in the background; on top of that, whoever is
 * working on the grid right now (a working drone, at its node) finishes
 * pieces at its own pace, counted for the sub-agent, its node and its parent.
 * DEMO-1 is under way at D3V1N, Rovo and the systems the request touches,
 * as one item among many.
 */
export class Volume {
  readonly ledger: WorkLedger;
  private readonly random: () => number;
  private readonly clocks = new Map<string, { t: number; every: number }>();
  private readonly drones = new Map<string, Drone>();

  constructor(
    stage: Pick<SceneHost, 'onTick'>,
    scene: Pick<TwoActScene, 'act1' | 'act2'>,
    private readonly workers: () => Worker[],
    seed = 1,
  ) {
    this.ledger = new WorkLedger(seed);
    this.random = seededRandom(seed ^ 0x9e3779b9);
    const nodes = [
      ...scene.act1.map.nodes.map((n) => ({ kind: n.kind, system: TOOLS })),
      ...scene.act2.map.nodes.map((n) => ({ kind: n.kind, system: ATLASSIAN })),
    ];
    for (const { kind, system } of nodes) {
      this.ledger.register({ id: nodeId(kind), kind: 'node', name: SYSTEM_NAME[kind], system });
    }
    this.ledger.register({ id: D3V1N_ID, kind: 'agent', name: 'D3V1N', system: TOOLS });
    this.ledger.register({ id: ROVO_ID, kind: 'agent', name: 'Rovo', system: ATLASSIAN });
    this.followRequest();
    stage.onTick((dt) => this.update(dt));
  }

  /** Put DEMO-1 to work: it touches both systems, so it's under way at both agents and five tools. */
  followRequest(): void {
    this.ledger.assign(DEMO_1, [
      D3V1N_ID,
      ROVO_ID,
      ...(['figma', 'github', 'notion', 'confluence', 'jira'] as const).map(nodeId),
    ]);
  }

  /** Make sure a worker's sub-agent is on the books; a new drone at the same spot starts over. */
  private enlist(w: Worker): void {
    if (!w.parentId || this.drones.get(w.id) === w.drone) return;
    this.drones.set(w.id, w.drone);
    const parent = this.ledger.entity(w.parentId);
    const at = w.nodeId && this.ledger.has(w.nodeId) ? this.ledger.entity(w.nodeId).name : 'its node';
    this.ledger.register({ id: w.id, kind: 'sub-agent', name: `${at} sub-agent`, system: parent.system });
    if (w.nodeId && this.ledger.tally(w.nodeId).items.some((i) => i.key === DEMO_1.key)) {
      this.ledger.assign(DEMO_1, [w.id]);
    }
  }

  private update(dt: number): void {
    for (const node of this.ledger.entities('node')) {
      if (this.due(`bg:${node.id}`, dt, BACKGROUND_PACE)) this.finish([node.id]);
      if (this.due(`in:${node.id}`, dt, ARRIVAL_PACE)) this.ledger.arrive([node.id]);
    }
    for (const w of this.workers()) {
      this.enlist(w);
      if (w.drone.status !== 'working') continue;
      const sub = Boolean(w.parentId);
      if (!this.due(`work:${w.id}`, dt, sub ? SUB_PACE : AGENT_PACE)) continue;
      const ids = [w.id];
      if (w.nodeId && this.ledger.has(w.nodeId)) ids.push(w.nodeId);
      if (w.parentId) ids.push(w.parentId);
      this.finish(ids);
    }
  }

  private finish(ids: string[]): void {
    this.ledger.complete(ids);
    if (this.random() < REFILL) this.ledger.arrive(ids);
  }

  /** Advance a named clock; true when it comes due (then it rewinds to a fresh interval in `range`). */
  private due(key: string, dt: number, [lo, hi]: [number, number]): boolean {
    let clock = this.clocks.get(key);
    if (!clock) {
      clock = { t: this.random() * hi, every: lo + this.random() * (hi - lo) };
      this.clocks.set(key, clock);
    }
    clock.t += dt;
    if (clock.t < clock.every) return false;
    clock.t = 0;
    clock.every = lo + this.random() * (hi - lo);
    return true;
  }
}
