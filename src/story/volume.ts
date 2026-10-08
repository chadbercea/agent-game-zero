import { seededRandom } from '../core/scatter';
import type { Drone } from '../primitives/drone/Drone';
import { SYSTEM_NAME, type SystemKind } from '../primitives/node/emblems';
import type { SceneHost } from '../stage/Stage';
import { DEMO_1, type WorkItem, WorkLedger } from './ledger';
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
const SUB_PACE: [number, number] = [2.2, 3.6];
/** A working parent agent finishes its own pieces (reviews, hand-offs) more slowly. */
const AGENT_PACE: [number, number] = [2.5, 4];
/** Everyone else's work at each node: the hundreds of other things getting done. */
const BACKGROUND_PACE: [number, number] = [3, 6];
/**
 * Work keeps coming: every piece finished brings another request into the
 * same queues, and now and then one extra, so the queues slowly grow. At a
 * node, each arrival is a new request landing in that system (`onArrive`):
 * the more work gets done, the more flows in.
 */
const EXTRA_ARRIVAL = 0.08;

export const nodeId = (kind: SystemKind) => `node:${kind}`;
const nodeKindOf = (id?: string) => (id?.startsWith('node:') ? (id.slice(5) as SystemKind) : undefined);

/** A piece of work an agent on the grid just finished: the item, who finished it, and at which system. */
export interface FinishedWork {
  item: WorkItem;
  by: string;
  nodeKind?: SystemKind;
}
export const subId = (kind: SystemKind) => `sub:${kind}`;
export const D3V1N_ID = 'agent:d3v1n';
export const ROVO_ID = 'agent:rovo';
/** The tools DEMO-1 touches. */
const DEMO_TOOLS: readonly SystemKind[] = ['figma', 'github', 'notion', 'confluence', 'jira'];

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
  private readonly arrivals: ((nodeId: string) => void)[] = [];
  private readonly finishes: ((done: FinishedWork) => void)[] = [];
  private readonly nodes: { kind: SystemKind; system: string }[];

  /**
   * `onGrid`: which tools are on the grid right now. With it, only those are
   * on the books: a tool joins (with today's numbers) when it comes up, does
   * background work only while it's there, and leaves the books when it goes,
   * so totals and shares count only tools on the grid. Without it, every tool
   * is on the books from the start.
   */
  constructor(
    stage: Pick<SceneHost, 'onTick'>,
    scene: Pick<TwoActScene, 'act1' | 'act2'>,
    private readonly workers: () => Worker[],
    seed = 1,
    private readonly onGrid?: (kind: SystemKind) => boolean,
  ) {
    this.ledger = new WorkLedger(seed);
    this.random = seededRandom(seed ^ 0x9e3779b9);
    this.nodes = [
      ...scene.act1.map.nodes.map((n) => ({ kind: n.kind, system: TOOLS })),
      ...scene.act2.map.nodes.map((n) => ({ kind: n.kind, system: ATLASSIAN })),
    ];
    if (!onGrid) for (const node of this.nodes) this.registerNode(node);
    this.ledger.register({ id: D3V1N_ID, kind: 'agent', name: 'D3V1N', system: TOOLS });
    this.ledger.register({ id: ROVO_ID, kind: 'agent', name: 'Rovo', system: ATLASSIAN });
    this.followRequest();
    stage.onTick((dt) => this.update(dt));
  }

  /** Put DEMO-1 to work: it touches both systems, so it's under way at both agents and five tools (those on the books). */
  followRequest(): void {
    this.ledger.clearVerdict(DEMO_1.key);
    this.ledger.assign(
      DEMO_1,
      [D3V1N_ID, ROVO_ID, ...DEMO_TOOLS.map(nodeId)].filter((id) => this.ledger.has(id)),
    );
  }

  private registerNode({ kind, system }: { kind: SystemKind; system: string }): void {
    const id = nodeId(kind);
    this.ledger.register({ id, kind: 'node', name: SYSTEM_NAME[kind], system });
    if (DEMO_TOOLS.includes(kind)) this.ledger.assign(DEMO_1, [id]);
  }

  /** Tools come onto the books as they come up on the grid, and leave when they go. */
  private syncGrid(): void {
    if (!this.onGrid) return;
    for (const node of this.nodes) {
      const id = nodeId(node.kind);
      const want = this.onGrid(node.kind);
      if (want && !this.ledger.has(id)) this.registerNode(node);
      else if (!want && this.ledger.has(id)) {
        this.ledger.unregister(id);
        this.clocks.delete(`bg:${id}`);
      }
    }
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
    this.syncGrid();
    for (const node of this.ledger.entities('node')) {
      if (this.due(`bg:${node.id}`, dt, BACKGROUND_PACE)) this.finish([node.id]);
    }
    for (const w of this.workers()) {
      this.enlist(w);
      if (w.drone.status !== 'working') continue;
      const sub = Boolean(w.parentId);
      if (!this.due(`work:${w.id}`, dt, sub ? SUB_PACE : AGENT_PACE)) continue;
      const ids = [w.id];
      if (w.nodeId && this.ledger.has(w.nodeId)) ids.push(w.nodeId);
      if (w.parentId) ids.push(w.parentId);
      const item = this.finish(ids);
      if (item) for (const fn of this.finishes) fn({ item, by: w.id, nodeKind: nodeKindOf(w.nodeId) });
    }
  }

  /**
   * Listen for work the agents on the grid finish (not the background work at
   * the nodes): what goes to review. Returns a function that stops listening.
   */
  onFinish(fn: (done: FinishedWork) => void): () => void {
    this.finishes.push(fn);
    return () => this.finishes.splice(this.finishes.indexOf(fn) >>> 0, 1);
  }

  /** Listen for new requests landing at nodes (to show them arriving). Returns a function that stops listening. */
  onArrive(fn: (nodeId: string) => void): () => void {
    this.arrivals.push(fn);
    return () => this.arrivals.splice(this.arrivals.indexOf(fn) >>> 0, 1);
  }

  private finish(ids: string[]): WorkItem | undefined {
    const item = this.ledger.complete(ids);
    const count = this.random() < EXTRA_ARRIVAL ? 2 : 1;
    this.ledger.arrive(ids, count);
    for (const id of ids) {
      if (this.ledger.entity(id).kind !== 'node') continue;
      for (let i = 0; i < count; i++) for (const fn of this.arrivals) fn(id);
    }
    return item;
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
