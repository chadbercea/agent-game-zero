import { seededRandom } from '../core/scatter';
import { Cloud } from '../primitives/cloud/Cloud';
import type { SystemKind } from '../primitives/node/emblems';
import type { SystemNode } from '../primitives/node/SystemNode';
import { Ticket } from '../primitives/ticket/Ticket';
import type { SceneHost } from '../stage/Stage';
import { cloudDrop } from './cloudDrop';

/** Where people hand work in: the tools a human files issues and pages into. */
export const HUMAN_TOOLS: readonly SystemKind[] = ['jira', 'confluence', 'notion'];

/** Seconds between clouds, each one picked from this range. */
const GAP: [number, number] = [3, 8];
/** How high a cloud floats, and how far its path turns off straight, picked per cloud. */
const HEIGHT: [number, number] = [3, 3.8];
const TILT: [number, number] = [-0.3, 0.3];
/** At most this many clouds out at once: calm, not a storm. */
const MAX_CLOUDS = 2;
const SMALL = 0.38;

interface Visit {
  cloud: Cloud;
  ticket: Ticket;
}

/**
 * The human in the loop: clouds keep drifting by, each dropping an issue
 * into a tool people work in (Jira, Confluence, Notion). Which tool, the
 * cloud's path and height, and how long until the next one are all picked by
 * a seeded random generator, so there's no pattern to spot. Only tools that
 * are online (visible and not dimmed) get issues.
 *
 * `start()` sets it going; `stop()` lets the clouds out finish and stops new ones.
 */
export class HumanLoop {
  private readonly random: () => number;
  private readonly pool: Visit[] = [];
  private out = 0;
  private running = false;
  private untick: (() => void) | null = null;
  /** Seconds until the next cloud. */
  private countdown = 0;
  /** How many issues have been dropped in since start (for tests and counts). */
  delivered = 0;
  /** Most clouds out at the same time so far. */
  peak = 0;
  /** Which tools have had issues dropped in, in order (for tests). */
  readonly log: SystemKind[] = [];

  constructor(
    private readonly stage: SceneHost,
    private readonly nodes: Record<SystemKind, SystemNode>,
    seed = 1,
  ) {
    this.random = seededRandom(seed);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.countdown = this.between(GAP) * 0.5;
    this.untick = this.stage.onTick((dt) => {
      this.countdown -= dt;
      if (this.countdown > 0 || this.out >= MAX_CLOUDS) return;
      this.countdown = this.between(GAP);
      const online = HUMAN_TOOLS.map((k) => this.nodes[k]).filter((n) => n.visible && n.dim < 0.5);
      if (!online.length) return;
      void this.visit(online[Math.floor(this.random() * online.length)]);
    });
  }

  stop(): void {
    this.running = false;
    this.untick?.();
    this.untick = null;
  }

  private between([lo, hi]: [number, number]): number {
    return lo + this.random() * (hi - lo);
  }

  private take(): Visit {
    const free = this.pool.pop();
    if (free) return free;
    const cloud = new Cloud();
    cloud.visible = false;
    const ticket = new Ticket(undefined, { label: false });
    ticket.scale.setScalar(SMALL);
    ticket.visible = false;
    this.stage.add(cloud, ticket);
    this.stage.onTick((dt) => {
      if (cloud.visible) cloud.update(dt);
      if (ticket.visible) ticket.update(dt);
    });
    return { cloud, ticket };
  }

  private async visit(node: SystemNode): Promise<void> {
    this.out++;
    this.peak = Math.max(this.peak, this.out);
    const v = this.take();
    v.ticket.scale.setScalar(SMALL);
    await cloudDrop(this.stage, v.cloud, v.ticket, node.position, {
      height: this.between(HEIGHT),
      tilt: this.between(TILT),
      onLand: () => {
        this.delivered++;
        this.log.push(node.kind);
      },
    });
    this.pool.push(v);
    this.out--;
  }
}
