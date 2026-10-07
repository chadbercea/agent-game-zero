import { Vector3 } from 'three';
import { seededRandom } from '../core/scatter';
import { Cloud } from '../primitives/cloud/Cloud';
import { Hand, MAX_REACH, WAVE } from '../primitives/hand/Hand';
import type { SystemKind } from '../primitives/node/emblems';
import type { SystemNode } from '../primitives/node/SystemNode';
import { TICKET_CARD_H, Ticket } from '../primitives/ticket/Ticket';
import type { SceneHost } from '../stage/Stage';
import { tween, wait } from './timeline';

/** Where people hand work in: the tools a human files issues and pages into. */
export const HUMAN_TOOLS: readonly SystemKind[] = ['jira', 'confluence', 'notion'];

/** Seconds between clouds, each one picked from this range. */
const GAP: [number, number] = [2.2, 6.5];
/** How high a cloud floats, picked per visit. */
const HEIGHT: [number, number] = [2.6, 3.4];
/** How far beside the tool the issue is set down before it slides in. */
const BESIDE = 0.85;
/** At most this many clouds out at once. */
const MAX_CLOUDS = 2;
const SMALL = 0.38;
const HAND_SCALE = 1.1;

/** Screen-left and screen-front of a tool: the sides a cloud comes down on (screen-right is where the ticket rests at Jira). */
const SIDES = [new Vector3(-1, 0, 1), new Vector3(1, 0, 1), new Vector3(-1, 0, -1)].map((v) => v.normalize());

interface Visit {
  cloud: Cloud;
  hand: Hand;
  ticket: Ticket;
}

/**
 * The human in the loop: clouds keep coming, each handing an issue down into
 * a tool people work in (Jira, Confluence, Notion), then going away. Which
 * tool, which side, how high, and how long until the next one are all picked
 * by a seeded random generator, so there's no pattern to spot. Only tools
 * that are online (visible and not dimmed) get issues.
 *
 * `start()` sets it going, `stop()` lets the clouds out finish and stops new
 * ones. Each visit is the opening's handoff, quicker: the cloud pops in
 * beside the tool, the hand sets a small issue down, the issue slides into
 * the tool (which pops), and the cloud goes.
 */
export class HumanLoop {
  private readonly random: () => number;
  private readonly pool: Visit[] = [];
  private out = 0;
  private running = false;
  private untick: (() => void) | null = null;
  /** Seconds until the next cloud. */
  private countdown = 0;
  /** How many issues have been handed in since start (for tests and counts). */
  delivered = 0;
  /** Most clouds out at the same time so far. */
  peak = 0;

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
      const node = online[Math.floor(this.random() * online.length)];
      void this.visit(node);
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
    const hand = new Hand();
    hand.scale.setScalar(HAND_SCALE);
    cloud.hand.add(hand);
    const ticket = new Ticket(undefined, { label: false });
    ticket.scale.setScalar(SMALL);
    this.stage.add(cloud, ticket);
    this.stage.onTick((dt) => {
      if (cloud.visible) cloud.update(dt);
      if (ticket.visible) ticket.update(dt);
    });
    return { cloud, hand, ticket };
  }

  /** Which tools have had issues handed in, in order (for tests). */
  readonly log: SystemKind[] = [];

  private async visit(node: SystemNode): Promise<void> {
    this.out++;
    this.peak = Math.max(this.peak, this.out);
    const { stage } = this;
    const v = this.take();
    const { cloud, hand, ticket } = v;
    const side = SIDES[Math.floor(this.random() * SIDES.length)];
    const spot = node.position.clone().addScaledVector(side, BESIDE);
    const height = this.between(HEIGHT);

    cloud.position.set(spot.x, height, spot.z);
    cloud.materialized = 0;
    cloud.visible = true;
    hand.reach = 0;
    hand.grip = 1;
    hand.wave = 0;
    ticket.visible = false;
    ticket.opacity = 1;
    ticket.scale.setScalar(SMALL);

    await tween(stage, 0.7, (t) => (cloud.materialized = t));
    // Down comes the issue, held by its top edge, to just over the floor beside the tool.
    const holdAt = 0.45 + (TICKET_CARD_H * SMALL) / 2;
    const socket = new Vector3();
    const follow = stage.onTick(() => {
      hand.socket.getWorldPosition(socket);
      ticket.position.set(socket.x, 0, socket.z);
      ticket.card.position.y = (socket.y - (TICKET_CARD_H * SMALL) / 2) / SMALL;
    });
    ticket.visible = true;
    const k = HAND_SCALE;
    const below = hand.depth - hand.reach * MAX_REACH;
    const reachTo = Math.min(1, Math.max(0, ((cloud.position.y + cloud.hand.position.y - holdAt) / k - below) / MAX_REACH));
    await tween(stage, 0.9, (t) => (hand.reach = reachTo * (1 - (1 - t) ** 3)));
    follow();
    await tween(stage, 0.25, (t) => (hand.grip = 1 - t));
    // It slides into the tool and the tool takes it in.
    const from = ticket.position.clone();
    const fromY = ticket.card.position.y;
    void tween(stage, 0.4, (t) => (hand.wave = Math.sin(t * Math.PI * 2) * WAVE * 0.7));
    await tween(stage, 0.55, (t) => {
      ticket.position.lerpVectors(from, node.position, t * t);
      ticket.card.position.y = fromY * (1 - t);
      ticket.scale.setScalar(SMALL * (1 - t * 0.85));
    });
    ticket.visible = false;
    this.delivered++;
    this.log.push(node.kind);
    void tween(stage, 0.35, (t) => node.scale.setScalar(1 + Math.sin(t * Math.PI) * 0.14));
    // Back up and away.
    await tween(stage, 0.45, (t) => (hand.reach = reachTo * (1 - t * t)));
    await tween(stage, 0.55, (t) => (cloud.materialized = 1 - t));
    cloud.visible = false;
    await wait(stage, 0.05);
    this.pool.push(v);
    this.out--;
  }
}
