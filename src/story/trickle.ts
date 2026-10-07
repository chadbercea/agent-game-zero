import { Vector3 } from 'three';
import type { Gate } from '../primitives/gate/Gate';
import { Ticket } from '../primitives/ticket/Ticket';
import type { SceneHost } from '../stage/Stage';
import type { SystemMap } from './SystemMap';

/** One system the trickle can land requests in: a gate and the map behind it. */
export interface TrickleSystem {
  gate: Gate;
  map: SystemMap;
}

/** How big a trickling ticket is next to the full-size card. */
export const SMALL_TICKET = 0.3;
/** Seconds a ticket takes to fall onto its gate. */
const FALL_SECONDS = 0.5;
const FALL_FROM = 2.6;
/** How high a ticket rides over the floor on its way out to its node. */
const RIDE = 0.12;
/** World units per second along the gate line. */
const RIDE_SPEED = 2.4;
const ABSORB_SECONDS = 0.25;
/** At most this many tickets in flight at once; past that, arrivals still count but aren't drawn. */
const MAX_IN_FLIGHT = 28;

interface Flight {
  ticket: Ticket;
  route: SystemMap['routes'][number];
  length: number;
  /** Seconds since it started falling. */
  t: number;
}

const point = new Vector3();

/**
 * The trickle: small, unlabeled tickets falling onto the gates, each riding
 * its gate line out to the node it's for and sinking into it. One ticket per
 * new request that lands at a node (feed it with `land`), and only while that
 * system is open (gate green, map revealed), so the system visibly fills with
 * work while agents are in it. Tickets are pooled.
 */
export class Trickle {
  private readonly flights: Flight[] = [];
  private readonly pool: Ticket[] = [];
  enabled = true;

  constructor(
    private readonly stage: SceneHost,
    private readonly systems: readonly TrickleSystem[],
  ) {
    stage.onTick((dt) => this.update(dt));
  }

  /** How many tickets are in the air or on the lines right now. */
  get inFlight(): number {
    return this.flights.length;
  }

  /** A new request landed at this node (`node:<kind>`): show it arriving, if its system is open. */
  land(nodeId: string): boolean {
    if (!this.enabled || this.flights.length >= MAX_IN_FLIGHT) return false;
    for (const { gate, map } of this.systems) {
      if (gate.state !== 'open' || !map.revealed) continue;
      const i = map.nodes.findIndex((n) => `node:${n.kind}` === nodeId);
      if (i < 0 || !map.nodes[i].visible) continue;
      const ticket = this.pool.pop() ?? this.make();
      ticket.visible = true;
      ticket.opacity = 1;
      ticket.scale.setScalar(SMALL_TICKET);
      ticket.position.copy(gate.position);
      const route = map.routes[i];
      this.flights.push({ ticket, route, length: route.getLength(), t: 0 });
      return true;
    }
    return false;
  }

  /** Clear every ticket in flight (on reset). */
  clear(): void {
    for (const f of this.flights.splice(0)) this.release(f.ticket);
  }

  private make(): Ticket {
    const ticket = new Ticket(undefined, { label: false });
    this.stage.add(ticket);
    return ticket;
  }

  private release(ticket: Ticket): void {
    ticket.visible = false;
    this.pool.push(ticket);
  }

  private update(dt: number): void {
    for (let k = this.flights.length - 1; k >= 0; k--) {
      const f = this.flights[k];
      f.t += dt;
      f.ticket.update(dt);
      const { ticket } = f;
      const ride = f.length / RIDE_SPEED;
      if (f.t < FALL_SECONDS) {
        // Falls onto the gate, easing in, fading in.
        const e = f.t / FALL_SECONDS;
        ticket.card.position.y = (RIDE + FALL_FROM * (1 - e * e)) / SMALL_TICKET;
        ticket.opacity = Math.min(1, e * 3);
      } else if (f.t < FALL_SECONDS + ride) {
        // Out along the gate line to its node.
        f.route.getPointAt(Math.min(1, (f.t - FALL_SECONDS) / ride), point);
        ticket.position.set(point.x, 0, point.z);
        ticket.card.position.y = RIDE / SMALL_TICKET;
      } else {
        // Sinks into the node.
        const e = Math.min(1, (f.t - FALL_SECONDS - ride) / ABSORB_SECONDS);
        ticket.scale.setScalar(SMALL_TICKET * (1 - e));
        if (e >= 1) {
          this.flights.splice(k, 1);
          this.release(ticket);
        }
      }
    }
  }
}
