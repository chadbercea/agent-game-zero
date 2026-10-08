import { Box3, type Object3D, Vector3 } from 'three';
import { DroneFlight } from '../animation/DroneFlight';
import { NODE_FOOTPRINT } from '../core/grid';
import { seededRandom } from '../core/scatter';
import { Cloud, pickCloudShape } from '../primitives/cloud/Cloud';
import { type Drone, SUB_AGENT_SCALE } from '../primitives/drone/Drone';
import { EMBLEM_SCALE, type SystemNode } from '../primitives/node/SystemNode';
import { Product } from '../primitives/product/Product';
import { Ticket } from '../primitives/ticket/Ticket';
import { spawnDrone } from '../stage/spawnDrone';
import type { SceneHost } from '../stage/Stage';
import { cloudDrop } from './cloudDrop';
import { absorb } from './request';
import { fly, tween } from './timeline';

/** Drops land at least this far outside the system's edge… */
export const RING_FROM = 0.9;
/** …and no further than this, so they read as "around the system", not "somewhere". */
export const RING_TO = 2.6;
/** Seconds between clouds, picked from this range. */
const GAP: [number, number] = [2.6, 5];
const MAX_CLOUDS = 2;
const CLOUD_HEIGHT: [number, number] = [3.2, 3.8];
const TILT: [number, number] = [-0.35, 0.35];
const CARD_SCALE = 0.42;
const SUB_SPEED = 4.2;
const BUD = 0.3;
const CARRY_Y = 0.75;
const CARRY_SCALE = 2.2;
/** Share of tickets that belong in Jira (the rest are doc requests, for Confluence). */
const TO_JIRA = 0.7;
/** The triage point stands out: Jira this much bigger than the tools around it. */
export const TRIAGE_SCALE = 1.3;

/** Where a ticket ended up. */
export type Route = 'jira' | 'confluence';

export interface IntakeCast {
  /** Everything that makes up the system right now (its nodes, gates): the footprint drops ring. Read live. */
  system: () => Object3D[];
  /** Where issues are triaged into: the triage point. */
  jira: SystemNode;
  /** Where doc requests go, if the system has it. */
  confluence?: SystemNode;
  /** The agents with Jira access whose sub-agents do the triage (any of them may send one). */
  crewFrom: () => Drone[];
}

/**
 * The intake (ILI-972): humans keep filing tickets from the clouds. Clouds
 * drift by and drop Jira tickets on the open floor just outside the
 * system, wherever its edge is right now (one node: just around it; a big
 * system: all around its extent). One to three sub-agents at a time, budded
 * off agents with Jira access, fly straight out, pick a ticket up, and
 * triage it to where it belongs: into Jira (most) or Confluence. Jira, the
 * triage point, stands a size bigger than the tools around it.
 *
 * Ambient: everything (timing, spots, shapes, routing, crew size) runs on a
 * seeded RNG, so a seed plays the same run. `start()` / `stop()`.
 */
export class Intake {
  /** How many sub-agents can be out at once this run (1–3). */
  readonly crew: number;
  readonly drops: Vector3[] = [];
  /** Tickets on the floor waiting for a sub-agent. */
  get backlog(): number {
    return this.waiting.length;
  }
  readonly routed: Route[] = [];
  out = 0;
  peakOut = 0;
  private readonly random: () => number;
  private readonly waiting: { ticket: Ticket; at: Vector3 }[] = [];
  private readonly clouds: Cloud[] = [];
  private cloudsOut = 0;
  private countdown = 0.4;
  private subs = 0;
  private untick: (() => void) | null = null;

  constructor(
    private readonly stage: SceneHost,
    private readonly cast: IntakeCast,
    seed = 7,
  ) {
    this.random = seededRandom(seed);
    this.crew = 1 + Math.floor(this.random() * 3);
    cast.jira.scale.setScalar(TRIAGE_SCALE);
  }

  start(): void {
    this.untick ??= this.stage.onTick((dt) => this.tick(dt));
  }

  /** No new clouds or sub-agents; what's out finishes. */
  stop(): void {
    this.untick?.();
    this.untick = null;
  }

  /** The system's footprint on the floor right now, padded by a node's half-width. */
  footprint(): Box3 {
    const box = new Box3();
    for (const o of this.cast.system()) if (o.visible) box.expandByPoint(o.position.clone().setY(0));
    if (box.isEmpty()) box.expandByPoint(this.cast.jira.position.clone().setY(0));
    return box.expandByVector(new Vector3(NODE_FOOTPRINT, 0, NODE_FOOTPRINT));
  }

  /** A spot in the ring around the footprint: outside it by RING_FROM–RING_TO, on the open floor. */
  spot(): Vector3 {
    const box = this.footprint();
    for (;;) {
      const p = new Vector3(
        box.min.x - RING_TO + this.random() * (box.max.x - box.min.x + 2 * RING_TO),
        0,
        box.min.z - RING_TO + this.random() * (box.max.z - box.min.z + 2 * RING_TO),
      );
      const out = outside(box, p);
      if (out >= RING_FROM && out <= RING_TO) return p;
    }
  }

  private tick(dt: number): void {
    for (const cloud of this.clouds) if (cloud.visible) cloud.update(dt);
    this.countdown -= dt;
    if (this.countdown <= 0 && this.cloudsOut < MAX_CLOUDS) {
      // Clouds come about as fast as this run's crew can clear the floor: fewer helpers, fewer clouds.
      this.countdown = this.between(GAP) * (4 / (this.crew + 2));
      void this.sendCloud();
    }
    while (this.out < this.crew && this.waiting.length > 0) void this.triage(this.waiting.shift()!);
  }

  private async sendCloud(): Promise<void> {
    const cloud = this.clouds.find((c) => !c.visible && !c.userData.busy) ?? this.newCloud();
    cloud.userData.busy = true;
    cloud.shape = pickCloudShape(this.random);
    this.cloudsOut++;
    const at = this.spot();
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
   * One sub-agent buds off an agent with Jira access, flies straight to the
   * ticket, takes it (it shrinks into an issue the sub-agent carries), flies
   * straight to where it belongs, hands it in (the tool lights for a moment),
   * and flies back to dissolve into its parent.
   */
  private async triage({ ticket, at }: { ticket: Ticket; at: Vector3 }): Promise<void> {
    const { stage, cast } = this;
    const parents = cast.crewFrom();
    const parent = parents[Math.floor(this.random() * parents.length)];
    const route: Route = !cast.confluence || this.random() < TO_JIRA ? 'jira' : 'confluence';
    const dest = route === 'jira' ? cast.jira : cast.confluence!;
    this.out++;
    this.peakOut = Math.max(this.peakOut, this.out);
    const sub = spawnDrone(stage, parent.position.x, parent.position.z, {
      name: `${parent.name}.${++this.subs}`,
      lineage: parent.lineage,
      subAgent: true,
      status: 'working',
    });
    parent.flash = 1;
    await Promise.all([
      fly(stage, DroneFlight.to(sub.drone, at, { speed: SUB_SPEED })),
      tween(stage, 0.6, (t) => sub.drone.scale.setScalar(SUB_AGENT_SCALE * (BUD + (1 - BUD) * t))),
    ]);
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
    sub.drone.status = 'working';
    await fly(stage, DroneFlight.to(sub.drone, dest.position, { speed: SUB_SPEED }));
    // Hand it in: the issue sinks into the tool, which lights for a moment.
    await tween(stage, 0.35, (t) => issue.scale.setScalar(CARRY_SCALE * Math.max(0.001, 1 - t)));
    issue.dispose();
    this.routed.push(route);
    dest.light = 'working';
    dest.emblem.scale.setScalar(EMBLEM_SCALE * 1.15);
    void tween(stage, 0.6, (t) => dest.emblem.scale.setScalar(EMBLEM_SCALE * (1.15 - 0.15 * t))).then(() => {
      if (!this.out) dest.light = 'off';
    });
    sub.drone.flash = 1;
    await fly(stage, DroneFlight.to(sub.drone, parent.position, { speed: SUB_SPEED }));
    await tween(stage, 0.4, (t) => {
      sub.drone.scale.setScalar(SUB_AGENT_SCALE * (1 - 0.7 * t));
      sub.drone.fade = 1 - t;
    });
    sub.despawn();
    parent.flash = 1;
    this.out--;
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

/** How far a floor point is outside a box (0 if inside), by the nearest edge. */
function outside(box: Box3, p: Vector3): number {
  const dx = Math.max(box.min.x - p.x, 0, p.x - box.max.x);
  const dz = Math.max(box.min.z - p.z, 0, p.z - box.max.z);
  return Math.hypot(dx, dz);
}
