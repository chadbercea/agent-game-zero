import { PacketFlight } from '../animation/PacketFlight';
import type { Drone } from '../primitives/drone/Drone';
import { Packet } from '../primitives/packet/Packet';
import { TICKET_HOVER, type Ticket } from '../primitives/ticket/Ticket';
import type { SceneHost } from '../stage/Stage';
import { tween, wait } from './timeline';

/** How high the ticket starts above its hover before it drops. */
const DROP_FROM = 4;
const DROP_SECONDS = 0.9;
/** How long the request sits on the grid before it's handed off. */
const SETTLE = 0.6;

/**
 * A request arrives: the ticket falls out of the sky onto its spot on the
 * grid, fading in as it comes, with a small bounce and a glow as it lands.
 */
export async function dropTicket(stage: SceneHost, ticket: Ticket): Promise<void> {
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
 * flies to the agent, which flashes as it takes the work. The ticket stays
 * where it is: the same request can start more than one agent's work.
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

/** The request is cleared away: the ticket rises and fades out. */
export async function liftTicket(stage: SceneHost, ticket: Ticket): Promise<void> {
  if (!ticket.visible) return;
  const from = ticket.card.position.y;
  await tween(stage, 0.6, (t) => {
    ticket.card.position.y = from + t * 0.8;
    ticket.opacity = 1 - t;
  });
  ticket.visible = false;
  ticket.card.position.y = TICKET_HOVER;
  ticket.opacity = 1;
  ticket.glow = 0;
}

/** Overshoot a touch past the end, then settle: a landing. */
function easeOutBack(t: number): number {
  const c = 1.4;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}
