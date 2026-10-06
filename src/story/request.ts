import { MathUtils, Vector3 } from 'three';
import { PacketFlight } from '../animation/PacketFlight';
import type { Drone } from '../primitives/drone/Drone';
import { Packet } from '../primitives/packet/Packet';
import { TICKET_HOVER, type Ticket } from '../primitives/ticket/Ticket';
import type { SceneHost } from '../stage/Stage';
import { tween, wait } from './timeline';

/** How high the ticket starts above its hover before it drops. */
const DROP_FROM = 3;
const DROP_SECONDS = 0.7;
/** How long the request sits in front of the agent before it's taken. */
const SETTLE = 0.4;
const ABSORB_SECONDS = 0.45;

/**
 * A request arrives: the ticket falls out of the sky onto a spot on the grid
 * (in front of the agent it's for), fading in as it comes, with a small
 * bounce as it lands.
 */
export async function dropTicket(stage: SceneHost, ticket: Ticket, at: Vector3): Promise<void> {
  ticket.position.copy(at);
  ticket.visible = true;
  ticket.opacity = 0;
  await tween(stage, DROP_SECONDS, (t) => {
    ticket.card.position.y = TICKET_HOVER + DROP_FROM * (1 - easeOutBack(t));
    ticket.opacity = Math.min(1, t * 2.5);
  });
  await wait(stage, SETTLE);
}

/**
 * The ticket hands its request to an agent: a packet leaves the card and
 * flies into the agent, which flashes as it takes the work.
 */
export async function handOff(stage: SceneHost, ticket: Ticket, agent: Drone): Promise<void> {
  const packet = new Packet();
  stage.add(packet);
  const flight = new PacketFlight(packet, ticket.card, agent.rig.hover, { speed: 6, linger: 0.4 });
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

/** Once the agent has the request, the ticket shrinks away where it stood. */
export async function absorb(stage: SceneHost, ticket: Ticket): Promise<void> {
  const scale = ticket.scale.x;
  await tween(stage, ABSORB_SECONDS, (t) => {
    ticket.scale.setScalar(MathUtils.lerp(scale, 0.001, t * t));
    ticket.opacity = 1 - t;
  });
  ticket.visible = false;
  ticket.scale.setScalar(scale);
  ticket.opacity = 1;
  ticket.card.position.y = TICKET_HOVER;
}

/** A request lands in front of an agent, the agent takes it, and the ticket is gone: one request among many. */
export async function takeRequest(stage: SceneHost, ticket: Ticket, at: Vector3, agent: Drone): Promise<void> {
  await dropTicket(stage, ticket, at);
  await handOff(stage, ticket, agent);
  await absorb(stage, ticket);
}

/** Overshoot a touch past the end, then settle: a landing. */
function easeOutBack(t: number): number {
  const c = 1.4;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}
