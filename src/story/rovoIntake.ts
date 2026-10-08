import { Vector3 } from 'three';
import { DroneFlight } from '../animation/DroneFlight';
import { seededRandom } from '../core/scatter';
import { Cloud, pickCloudShape } from '../primitives/cloud/Cloud';
import { SUB_AGENT_SCALE } from '../primitives/drone/Drone';
import { Pad } from '../primitives/pad/Pad';
import { Product } from '../primitives/product/Product';
import { Ticket } from '../primitives/ticket/Ticket';
import { type SpawnedDrone, spawnDrone } from '../stage/spawnDrone';
import type { SceneHost } from '../stage/Stage';
import { cloudDrop } from './cloudDrop';
import { absorb } from './request';
import { fly, tween } from './timeline';

/** Rovo sits dead center of the white space. */
export const ROVO_AT = new Vector3(0, 0, 0);
/** The general perimeter: cards land outside this radius, on the open floor around Rovo. */
export const PERIMETER = 4.5;
/** …and no further out than this, so they stay on screen. */
const DROP_OUT_TO = 6.5;
/**
 * Triage: where the sorted issues go, three piles just in front of Rovo
 * (down-left, down, down-right on screen), each on a small pad.
 */
export const PILES = [new Vector3(-0.5, 0, 2.5), new Vector3(1.5, 0, 1.5), new Vector3(2.5, 0, -0.5)];
/** A pile holds this many before its oldest issue clears away. */
const PILE_MAX = 4;
/** Seconds between clouds, picked from this range. */
const GAP: [number, number] = [2.6, 5];
/** At most this many clouds in the sky at once. */
const MAX_CLOUDS = 2;
const CLOUD_HEIGHT: [number, number] = [3.2, 3.8];
const TILT: [number, number] = [-0.35, 0.35];
/** A dropped card is small: one of many. */
const CARD_SCALE = 0.45;
/** Sub-agents fly at this speed: brisk, not frantic. */
const SUB_SPEED = 4.2;
/** A sub-agent buds off Rovo this small and grows as it flies out. */
const BUD = 0.3;
const CARRY_Y = 0.75;
const CARRY_SCALE = 2.2;
const PRODUCT_STEP = 0.2;

/** A card that has landed and is waiting to be picked up. */
interface Dropped {
  ticket: Ticket;
  at: Vector3;
}

/**
 * The white space and the intake (ILI-981): Rovo in the center of an empty
 * floor. Clouds drift by and drop Jira issues (cards) outside a general
 * perimeter around it. Rovo's sub-agents go get them, one card each, fly
 * straight there and back, and triage them: each issue lands on one of three
 * piles in front of Rovo. Everything ambient runs on a seeded RNG (when
 * clouds come, where cards land, which pile, and how many sub-agents Rovo
 * runs at once: one to three), so the same seed plays the same run.
 */
export class RovoIntake {
  readonly rovo: SpawnedDrone;
  readonly pads: Pad[];
  /** The issues on each pile, bottom first. */
  readonly piles: Product[][] = PILES.map(() => []);
  /** How many sub-agents Rovo runs at once this run (1–3). */
  readonly crew: number;
  /** Cards on the floor, waiting. */
  readonly waiting: Dropped[] = [];
  /** Where every card has landed, in order (for tests). */
  readonly drops: Vector3[] = [];
  /** Cards on the floor waiting for a sub-agent. */
  get backlog(): number {
    return this.waiting.length;
  }
  /** Sub-agents out right now, and the most out at once. */
  out = 0;
  peakOut = 0;
  /** Issues triaged so far. */
  triaged = 0;
  private readonly random: () => number;
  private readonly clouds: Cloud[] = [];
  private cloudsOut = 0;
  private countdown = 0.5;
  private subs = 0;
  private running = false;
  private untick: (() => void) | null = null;

  constructor(
    private readonly stage: SceneHost,
    seed = 7,
  ) {
    this.random = seededRandom(seed);
    this.crew = 1 + Math.floor(this.random() * 3);
    this.rovo = spawnDrone(stage, ROVO_AT.x, ROVO_AT.z, { name: 'Rovo', lineage: 'cyan', showLabel: true, status: 'waiting' });
    this.pads = PILES.map((at) => {
      const pad = new Pad({ width: 0.9, depth: 0.9 });
      pad.position.copy(at);
      pad.setColor(null);
      stage.add(pad);
      return pad;
    });
  }

  /** Start the clouds and the crew. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.untick = this.stage.onTick((dt) => this.tick(dt));
  }

  /** No new clouds or sub-agents; what's out finishes. */
  stop(): void {
    this.running = false;
    this.untick?.();
    this.untick = null;
  }

  private tick(dt: number): void {
    for (const cloud of this.clouds) if (cloud.visible) cloud.update(dt);
    this.countdown -= dt;
    if (this.countdown <= 0 && this.cloudsOut < MAX_CLOUDS) {
      // Clouds come about as fast as this run's crew can clear the floor (as in the Intake, ILI-972).
      this.countdown = this.between(GAP) * (4 / (this.crew + 2));
      void this.sendCloud();
    }
    while (this.out < this.crew && this.waiting.length > 0) void this.fetch(this.waiting.shift()!);
  }

  /** A cloud drifts across and drops a card somewhere outside the perimeter. */
  private async sendCloud(): Promise<void> {
    const cloud = this.clouds.find((c) => !c.visible && !c.userData.busy) ?? this.newCloud();
    cloud.userData.busy = true;
    cloud.shape = pickCloudShape(this.random);
    this.cloudsOut++;
    const angle = this.random() * Math.PI * 2;
    const radius = this.between([PERIMETER + 0.3, DROP_OUT_TO]);
    const at = new Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius).add(ROVO_AT);
    const ticket = new Ticket({ key: 'DEMO', title: 'Issue' }, { label: false });
    ticket.scale.setScalar(CARD_SCALE);
    this.stage.add(ticket);
    const untick = this.stage.onTick((dt) => ticket.update(dt));
    ticket.userData.untick = untick;
    await cloudDrop(this.stage, cloud, ticket, at, {
      height: this.between(CLOUD_HEIGHT),
      tilt: this.between(TILT),
      keep: true,
      onLand: () => {
        this.drops.push(at.clone());
        this.waiting.push({ ticket, at });
      },
    });
    this.cloudsOut--;
    cloud.userData.busy = false;
  }

  /**
   * One sub-agent buds off Rovo, flies straight to the card, takes it (the
   * card shrinks into an issue it carries), flies to the pile it triages the
   * issue onto, sets it down, and comes back to dissolve into Rovo.
   */
  private async fetch({ ticket, at }: Dropped): Promise<void> {
    const { stage } = this;
    const rovo = this.rovo.drone;
    this.out++;
    this.peakOut = Math.max(this.peakOut, this.out);
    const sub = spawnDrone(stage, ROVO_AT.x, ROVO_AT.z, {
      name: `Rovo.${++this.subs}`,
      lineage: 'cyan',
      subAgent: true,
      status: 'working',
    });
    rovo.flash = 1;
    rovo.status = 'working';
    await Promise.all([
      fly(stage, DroneFlight.to(sub.drone, at, { speed: SUB_SPEED })),
      tween(stage, 0.6, (t) => sub.drone.scale.setScalar(SUB_AGENT_SCALE * (BUD + (1 - BUD) * t))),
    ]);
    // Take the card: it lights, shrinks away, and the issue rides above the sub-agent.
    sub.drone.status = 'waiting';
    ticket.glow = 1;
    await absorb(stage, ticket);
    (ticket.userData.untick as () => void)();
    ticket.dispose();
    const issue = new Product('jira');
    issue.rotation.y -= sub.drone.rotation.y;
    issue.position.y = CARRY_Y;
    issue.scale.setScalar(CARRY_SCALE);
    sub.drone.rig.hover.add(issue);
    sub.drone.flash = 1;
    // Triage: which pile it belongs on.
    const pile = Math.floor(this.random() * PILES.length);
    sub.drone.status = 'working';
    await fly(stage, DroneFlight.to(sub.drone, PILES[pile], { speed: SUB_SPEED }));
    await this.setDown(issue, pile);
    sub.drone.flash = 1;
    // Back to Rovo, and dissolve into it.
    await fly(stage, DroneFlight.to(sub.drone, ROVO_AT, { speed: SUB_SPEED }));
    await tween(stage, 0.4, (t) => {
      sub.drone.scale.setScalar(SUB_AGENT_SCALE * (1 - 0.7 * t));
      sub.drone.fade = 1 - t;
    });
    sub.despawn();
    rovo.flash = 1;
    this.out--;
    if (this.out === 0) rovo.status = 'waiting';
  }

  /** The carried issue drops onto the top of its pile; a full pile clears its oldest. */
  private async setDown(issue: Product, pile: number): Promise<void> {
    const { stage } = this;
    const stack = this.piles[pile];
    const from = issue.getWorldPosition(new Vector3());
    issue.removeFromParent();
    issue.rotation.y = Math.PI / 4;
    issue.scale.setScalar(1.6);
    stage.add(issue);
    const to = PILES[pile].clone().setY(0.42 + stack.length * PRODUCT_STEP);
    stack.push(issue);
    await tween(stage, 0.35, (t) => issue.position.lerpVectors(from, to, t * t));
    this.triaged++;
    if (stack.length > PILE_MAX) {
      const oldest = stack.shift()!;
      await tween(stage, 0.3, (t) => {
        oldest.scale.setScalar(Math.max(0.001, 1.6 * (1 - t)));
        stack.forEach((p, i) => (p.position.y = 0.42 + (i + 1 - t) * PRODUCT_STEP));
      });
      oldest.dispose();
    }
  }

  private newCloud(): Cloud {
    const cloud = new Cloud();
    cloud.visible = false;
    this.stage.add(cloud);
    this.clouds.push(cloud);
    return cloud;
  }

  private between([lo, hi]: [number, number]): number {
    return lo + this.random() * (hi - lo);
  }
}
