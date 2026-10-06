import { seededRandom } from '../core/scatter';

/** One piece of work: a request, by key and title. */
export interface WorkItem {
  key: string;
  title: string;
}

/** What kind of thing is doing the work. */
export type EntityKind = 'node' | 'agent' | 'sub-agent';

/** Something whose work the ledger counts: a system node, a parent agent, or a sub-agent. */
export interface Entity {
  id: string;
  kind: EntityKind;
  /** Display name: "Jira", "D3V1N", "Figma sub-agent". */
  name: string;
  /** Which system it belongs to (a gate's name), for system totals. */
  system: string;
}

/** An entity's work today: finished, under way (with what it is), and waiting. */
export interface Tally {
  done: number;
  inProgress: number;
  queued: number;
  /** What's under way, oldest first. Its length is `inProgress`. */
  items: readonly WorkItem[];
}

export interface Totals {
  done: number;
  inProgress: number;
  queued: number;
}

/** The request the story follows. It's one item among many: the ledger never finishes it on its own. */
export const DEMO_1: WorkItem = { key: 'DEMO-1', title: 'Add dark mode' };

const TITLES = [
  'Fix login redirect',
  'Update billing copy',
  'Add CSV export',
  'Speed up search',
  'Onboarding checklist',
  'Rate-limit the API',
  'Retry failed webhooks',
  'Audit log filters',
  'Mobile nav polish',
  'Upgrade Node runtime',
  'Invoice PDF layout',
  'SSO for Okta',
  'Empty states',
  'Keyboard shortcuts',
  'Archive old projects',
  'Bulk edit tags',
  'Notification digest',
  'Fix timezone bug',
  'Accessibility pass',
  'Dashboard load time',
  'Dependency updates',
  'Cache invalidation',
  'Release notes',
  'Flaky checkout test',
];

/** Where a fresh entity starts the day: how much it has already done, has going, and has waiting. */
const START: Record<EntityKind, { done: [number, number]; inProgress: [number, number]; queued: [number, number] }> = {
  node: { done: [60, 180], inProgress: [4, 11], queued: [8, 30] },
  agent: { done: [20, 60], inProgress: [3, 7], queued: [2, 9] },
  'sub-agent': { done: [0, 4], inProgress: [1, 3], queued: [0, 3] },
};

interface Book {
  entity: Entity;
  done: number;
  queued: number;
  items: WorkItem[];
}

/**
 * The work ledger: simulated volume of work for today, across every node,
 * agent and sub-agent on the grid. Deterministic for a given seed, so every
 * run of the story starts from the same numbers.
 *
 * The story's request, DEMO-1, sits among the items of whoever it's assigned
 * to (`assign`). Everything else is the hundreds of other things getting
 * done at the same time: `complete` finishes the oldest other item and
 * starts the next one from the queue.
 */
export class WorkLedger {
  private readonly books = new Map<string, Book>();
  private readonly random: () => number;
  private nextKey: number;

  constructor(seed = 1) {
    this.random = seededRandom(seed);
    this.nextKey = 200 + Math.floor(this.random() * 300);
  }

  /** Add an entity with today's starting numbers, or start it over if it's already here (a sub-agent respawned). */
  register(entity: Entity): void {
    const start = START[entity.kind];
    const items = Array.from({ length: this.between(start.inProgress) }, () => this.newItem());
    this.books.set(entity.id, {
      entity,
      done: this.between(start.done),
      queued: this.between(start.queued),
      items,
    });
  }

  has(id: string): boolean {
    return this.books.has(id);
  }

  entity(id: string): Entity {
    return this.book(id).entity;
  }

  entities(kind?: EntityKind): Entity[] {
    return [...this.books.values()].map((b) => b.entity).filter((e) => !kind || e.kind === kind);
  }

  tally(id: string): Tally {
    const { done, queued, items } = this.book(id);
    return { done, inProgress: items.length, queued, items: [...items] };
  }

  /** Put DEMO-1 (or any item) to work at these entities, at the front of what they're doing. */
  assign(item: WorkItem, ids: readonly string[]): void {
    for (const id of ids) {
      const book = this.book(id);
      if (!book.items.some((i) => i.key === item.key)) book.items.unshift(item);
    }
  }

  /**
   * One piece of work finishes at each of these entities: the oldest item
   * other than the followed request is done, and the next one starts from the
   * queue (or a new request arrives if the queue is empty).
   */
  complete(ids: readonly string[]): void {
    for (const id of ids) {
      const book = this.book(id);
      const i = book.items.findIndex((item) => item.key !== DEMO_1.key);
      if (i >= 0) book.items.splice(i, 1);
      book.done++;
      if (book.queued > 0) book.queued--;
      book.items.push(this.newItem());
    }
  }

  /** New requests land in these entities' queues. */
  arrive(ids: readonly string[], count = 1): void {
    for (const id of ids) this.book(id).queued += count;
  }

  /** Finish one specific item everywhere it's under way (e.g. DEMO-1 when it ships). */
  finish(key: string): void {
    for (const book of this.books.values()) {
      const i = book.items.findIndex((item) => item.key === key);
      if (i < 0) continue;
      book.items.splice(i, 1);
      book.done++;
    }
  }

  /** Totals across one kind of entity, optionally within one system. */
  totals(kind: EntityKind, system?: string): Totals {
    const sum: Totals = { done: 0, inProgress: 0, queued: 0 };
    for (const { entity, done, queued, items } of this.books.values()) {
      if (entity.kind !== kind || (system && entity.system !== system)) continue;
      sum.done += done;
      sum.inProgress += items.length;
      sum.queued += queued;
    }
    return sum;
  }

  /** This entity's share (0–1) of everything done today by its kind (nodes among nodes, agents among agents). */
  share(id: string): number {
    const { entity, done } = this.book(id);
    const all = this.totals(entity.kind).done;
    return all > 0 ? done / all : 0;
  }

  /** A system's share (0–1) of everything the nodes did today. */
  systemShare(system: string): number {
    const all = this.totals('node').done;
    return all > 0 ? this.totals('node', system).done / all : 0;
  }

  private book(id: string): Book {
    const book = this.books.get(id);
    if (!book) throw new Error(`WorkLedger: no entity "${id}"`);
    return book;
  }

  private between([lo, hi]: [number, number]): number {
    return lo + Math.floor(this.random() * (hi - lo + 1));
  }

  private newItem(): WorkItem {
    const title = TITLES[Math.floor(this.random() * TITLES.length)];
    return { key: `DEMO-${this.nextKey++}`, title };
  }
}
