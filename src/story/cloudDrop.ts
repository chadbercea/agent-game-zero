import { MathUtils, Vector3 } from 'three';
import type { Cloud } from '../primitives/cloud/Cloud';
import { TICKET_HOVER, type Ticket } from '../primitives/ticket/Ticket';
import type { SceneHost } from '../stage/Stage';
import { tween } from './timeline';

/** Clouds drift along screen-right (left to right across the view), give or take a little. */
const ACROSS = new Vector3(1, 0, -1).normalize();
/** How far off its target a cloud starts and ends its drift (off the edge of the action). */
const REACH = 9;
/**
 * Drift speed, world units per second: fixed and unhurried (ILI-984). A
 * cloud doesn't speed up or slow down across the sky; its ease in and out is
 * only at the start and the stop, as it puffs into being and away.
 */
export const DRIFT_SPEED = 1.4;
/** Clouds float by in groups of up to this many. */
export const MAX_GROUP = 3;
/** How long a dropped ticket takes to fall. */
const FALL_SECONDS = 0.6;

export interface DropOptions {
  /** How high the cloud floats. */
  height: number;
  /** Turn of its path off straight screen-right, in radians (small: a little up or down the screen). */
  tilt?: number;
  /** After it lands, does the ticket stay where it fell (true) or is it taken into the tool (false, default)? */
  keep?: boolean;
  /** Called the moment the ticket lands. */
  onLand?: () => void;
  /** Clouds floating along with this one, each held at its offset from it (see groupOffsets). */
  escorts?: { cloud: Cloud; offset: Vector3 }[];
}

/**
 * Where the other clouds in a group float, relative to the one that drops
 * the ticket: a little ahead or behind, off to one side, a touch higher or
 * lower. From a seeded random generator, so a seeded run groups the same way.
 */
export function groupOffsets(random: () => number, count: number): Vector3[] {
  const side = new Vector3(1, 0, 1).normalize();
  return Array.from({ length: count }, (_, i) => {
    const along = (i % 2 === 0 ? -1 : 1) * (1.8 + random() * 1.4);
    const across = (random() < 0.5 ? -1 : 1) * (0.8 + random() * 1);
    return ACROSS.clone().multiplyScalar(along).addScaledVector(side, across).setY((random() - 0.5) * 0.6);
  });
}

/**
 * A cloud drifts across the sky, in from one side and out the other, and as
 * it passes over `target` it lets go of `ticket`, which falls onto the spot
 * below with a little bounce. Then it's either taken in (it shrinks away
 * into the tool) or stays where it fell (`keep`). The cloud fades in as it
 * comes and out as it goes, and is hidden at the end.
 *
 * Resolves once the cloud has gone (the ticket has landed by then).
 */
export async function cloudDrop(
  stage: SceneHost,
  cloud: Cloud,
  ticket: Ticket,
  target: Vector3,
  { height, tilt = 0, keep = false, onLand = () => {}, escorts = [] }: DropOptions,
): Promise<void> {
  const dir = ACROSS.clone().applyAxisAngle(new Vector3(0, 1, 0), tilt);
  const from = target.clone().addScaledVector(dir, -REACH).setY(height);
  const to = target.clone().addScaledVector(dir, REACH).setY(height);
  const seconds = (REACH * 2) / DRIFT_SPEED;
  const group = [cloud, ...escorts.map((e) => e.cloud)];
  for (const c of group) {
    c.visible = true;
    c.materialized = 0;
  }
  ticket.visible = false;
  let dropped = false;
  let landed: Promise<void> = Promise.resolve();
  await tween(stage, seconds, (t) => {
    // One steady speed all the way across (ILI-984); the group floats along together.
    cloud.position.lerpVectors(from, to, t);
    for (const e of escorts) e.cloud.position.copy(cloud.position).add(e.offset);
    // The ease in and out is the start and the stop: puffing into being over the first stretch, away over the last.
    const m = Math.min(1, t / 0.18, (1 - t) / 0.18);
    for (const c of group) c.materialized = m;
    if (!dropped && t >= 0.5) {
      dropped = true;
      landed = fall(stage, ticket, target, height, keep).then(onLand);
    }
  });
  for (const c of group) c.visible = false;
  await landed;
}

/** The ticket falls from under the cloud onto the spot, bounces once, then is taken in or stays. */
async function fall(stage: SceneHost, ticket: Ticket, target: Vector3, from: number, keep: boolean): Promise<void> {
  const scale = ticket.scale.x;
  const top = (from - 0.4) / scale;
  const rest = TICKET_HOVER;
  ticket.position.copy(target).setY(0);
  ticket.card.position.y = top;
  ticket.opacity = 1;
  ticket.visible = true;
  await tween(stage, FALL_SECONDS, (t) => {
    // Falls, then a small bounce as it lands.
    const fallT = Math.min(1, t / 0.8);
    const bounce = t > 0.8 ? Math.sin(((t - 0.8) / 0.2) * Math.PI) * 0.18 : 0;
    ticket.card.position.y = MathUtils.lerp(top, rest, fallT * fallT) + bounce;
  });
  ticket.glow = 0.7;
  if (keep) return;
  await tween(stage, 0.4, (t) => {
    ticket.scale.setScalar(Math.max(0.001, scale * (1 - t)));
    ticket.opacity = 1 - t;
  });
  ticket.visible = false;
  ticket.scale.setScalar(scale);
}
