import { MathUtils, Vector3 } from 'three';
import type { Cloud } from '../primitives/cloud/Cloud';
import { TICKET_HOVER, type Ticket } from '../primitives/ticket/Ticket';
import type { SceneHost } from '../stage/Stage';
import { tween } from './timeline';

/** Clouds drift along screen-right (left to right across the view), give or take a little. */
const ACROSS = new Vector3(1, 0, -1).normalize();
/** How far off its target a cloud starts and ends its drift (off the edge of the action). */
const REACH = 9;
/** Average drift speed, world units per second (it eases in and out around this). */
const DRIFT_SPEED = 2.6;
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
  { height, tilt = 0, keep = false, onLand = () => {} }: DropOptions,
): Promise<void> {
  const dir = ACROSS.clone().applyAxisAngle(new Vector3(0, 1, 0), tilt);
  const from = target.clone().addScaledVector(dir, -REACH).setY(height);
  const to = target.clone().addScaledVector(dir, REACH).setY(height);
  const seconds = (REACH * 2) / DRIFT_SPEED;
  cloud.visible = true;
  cloud.materialized = 0;
  ticket.visible = false;
  let dropped = false;
  let landed: Promise<void> = Promise.resolve();
  await tween(stage, seconds, (t) => {
    // Eases in from rest and out to rest (ILI-972): slow at the edges, quickest over the drop.
    cloud.position.lerpVectors(from, to, easeInOut(t));
    // Puffs in over the first stretch, out over the last.
    cloud.materialized = Math.min(1, t / 0.18, (1 - t) / 0.18);
    if (!dropped && t >= 0.5) {
      dropped = true;
      landed = fall(stage, ticket, target, height, keep).then(onLand);
    }
  });
  cloud.visible = false;
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

/** A pronounced ease-in-out (cubic): still at both ends, halfway at the middle, so the drop stays centered. */
export function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}
