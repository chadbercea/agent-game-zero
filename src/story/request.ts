import { type Curve, MathUtils, type Object3D, Vector3 } from 'three';
import { PacketFlight } from '../animation/PacketFlight';
import { HOVER_HEIGHT, type Drone } from '../primitives/drone/Drone';
import type { SystemKind } from '../primitives/node/emblems';
import { Packet } from '../primitives/packet/Packet';
import { TICKET_HOVER, type Ticket } from '../primitives/ticket/Ticket';
import type { SceneHost } from '../stage/Stage';
import { type Boost, shoot } from './beam';
import { tween, wait } from './timeline';

/** How high the ticket starts above its hover before it drops. */
const DROP_FROM = 4;
const DROP_SECONDS = 0.9;
/** How long the request sits in front of the agent before it reads it. */
const SETTLE = 0.5;
/** A carried card is bigger than one set down, so its rows read at story zoom. */
export const CARRY_SCALE = 1.7;
/** Where a carried card floats over its agent: its bottom edge clear of the agent's name tag. */
export const CARRY_HEIGHT = HOVER_HEIGHT + 2.8;
const PICK_UP_SECONDS = 0.8;
/** How quickly a carried card catches up with its agent (per second). */
const FOLLOW = 7;
/** A delivered product's last leg: up off the gate and into its row on the card. */
const RISE_SECONDS = 0.55;
const RIDE_HEIGHT = 0.16;

/**
 * A request arrives: the ticket falls out of the sky onto a spot on the
 * grid (in front of the agent it's for), fading in as it comes, with a small
 * bounce and a glow as it lands.
 */
export async function dropTicket(stage: SceneHost, ticket: Ticket, at: Vector3): Promise<void> {
  ticket.position.copy(at);
  ticket.visible = true;
  ticket.opacity = 0;
  await tween(stage, DROP_SECONDS, (t) => {
    ticket.card.position.y = TICKET_HOVER + DROP_FROM * (1 - easeOutBack(t));
    ticket.opacity = Math.min(1, t * 2.5);
  });
  ticket.glow = 0.6;
  await wait(stage, SETTLE);
}

/**
 * The ticket hands its request to an agent: a packet leaves the card and
 * flies into the agent, which flashes as it takes the work. Used when the
 * agent reads the ticket, and when another agent picks up the same request.
 */
export async function handOff(stage: SceneHost, ticket: Ticket, agent: Drone): Promise<void> {
  const packet = new Packet();
  stage.add(packet);
  const flight = new PacketFlight(packet, ticket.card, agent.rig.hover, { speed: 7, linger: 0.4 });
  ticket.glow = 1;
  await new Promise<void>((resolve) => {
    let landed = false;
    const untick = stage.onTick((dt) => {
      flight.update(dt);
      if (!landed && !packet.cube.visible) {
        landed = true;
        agent.flash = 1;
      }
      if (!flight.done) return;
      untick();
      resolve();
    });
  });
  packet.dispose();
}

/**
 * The agent picks the ticket up: the card rises into place over the agent,
 * then rides with it wherever it flies. Returns a function that lets go
 * (the card stays where it is).
 */
export async function pickUp(stage: SceneHost, ticket: Ticket, agent: Drone): Promise<() => void> {
  const from = ticket.position.clone();
  const fromY = ticket.card.position.y;
  await tween(stage, PICK_UP_SECONDS, (t) => {
    const e = t * t * (3 - 2 * t);
    ticket.position.lerpVectors(from, agent.position, e).setY(0);
    ticket.card.position.y = MathUtils.lerp(fromY, CARRY_HEIGHT, e);
    ticket.card.scale.setScalar(MathUtils.lerp(1, CARRY_SCALE, e));
  });
  return stage.onTick((dt) => {
    const k = 1 - Math.exp(-FOLLOW * dt);
    ticket.position.x += (agent.position.x - ticket.position.x) * k;
    ticket.position.z += (agent.position.z - ticket.position.z) * k;
  });
}

const riseFrom = new Vector3();
const riseTo = new Vector3();

/**
 * A piece of the work comes back to the ticket: a product rides `route` along
 * the floor to the gate, lifts off it into the card, and ticks the row for
 * the system it came from.
 */
export async function deliver(
  stage: SceneHost,
  ticket: Ticket,
  kind: SystemKind,
  route: Curve<Vector3>,
  options: { speed?: number; boost?: Boost } = {},
): Promise<void> {
  await shoot(stage, route, options.speed, options.boost);
  const gate = route.getPoint(1);
  await rise(stage, gate, ticket.card);
  ticket.tick(kind);
  ticket.glow = 0.5;
}

/** A product lifts off a floor point and up into a target. */
async function rise(stage: SceneHost, from: Vector3, target: Object3D): Promise<void> {
  const packet = new Packet();
  packet.trail.visible = false;
  stage.add(packet);
  riseFrom.set(from.x, RIDE_HEIGHT, from.z);
  await tween(stage, RISE_SECONDS, (t) => {
    target.getWorldPosition(riseTo);
    const e = t * t * (3 - 2 * t);
    packet.cube.position.lerpVectors(riseFrom, riseTo, e);
    packet.cube.rotation.y = t * 4;
    packet.cube.scale.setScalar(MathUtils.lerp(1, 0.4, e));
  });
  packet.dispose();
}

/** The request is cleared away: the ticket rises and fades out, then resets to a fresh, hidden ticket. */
export async function liftTicket(stage: SceneHost, ticket: Ticket): Promise<void> {
  if (!ticket.visible) return;
  const from = ticket.card.position.y;
  await tween(stage, 0.6, (t) => {
    ticket.card.position.y = from + t * 0.8;
    ticket.opacity = 1 - t;
  });
  ticket.visible = false;
  ticket.card.position.y = TICKET_HOVER;
  ticket.card.scale.setScalar(1);
  ticket.opacity = 1;
  ticket.reset();
}

/** Overshoot a touch past the end, then settle: a landing. */
function easeOutBack(t: number): number {
  const c = 1.4;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}
