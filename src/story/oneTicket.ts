import { Group, LineCurve3, Mesh, MeshBasicMaterial, TubeGeometry, Vector3 } from 'three';
import { DroneFlight } from '../animation/DroneFlight';
import { GateAnimator } from '../animation/GateAnimator';
import { NEUTRAL } from '../core/palette';
import { Gate } from '../primitives/gate/Gate';
import type { Drone } from '../primitives/drone/Drone';
import type { SystemKind } from '../primitives/node/emblems';
import { SystemNode } from '../primitives/node/SystemNode';
import { Product } from '../primitives/product/Product';
import { Ticket } from '../primitives/ticket/Ticket';
import { type AttachedSignal, attachSignal } from '../stage/attachSignal';
import { type SpawnedDrone, spawnDrone } from '../stage/spawnDrone';
import type { SceneHost } from '../stage/Stage';
import { accessCheck } from './accessCheck';
import { dropTicket, handOff } from './request';
import { fly, tween, wait } from './timeline';

/** The one ticket's beats, in order (Version A for now). */
export const ONE_TICKET_BEATS = ['a1', 'a2'] as const;
export type OneTicketBeat = (typeof ONE_TICKET_BEATS)[number];

/** The work in Version A: a Linear issue, assigned to D3V1N. */
export const ILI_990 = { key: 'ILI-990', title: 'Add dark mode' };

/** Version A's tools, in the order D3V1N visits them, left to right on screen. */
export const A_KINDS: readonly SystemKind[] = ['linear', 'notion', 'figma', 'github'];

/** Screen-right on the floor, one step between tools in the row. */
const STEP = new Vector3(3, 0, -3);
/**
 * A tool's gate stands this far in front of it (toward the camera, down on
 * screen): far enough that D3V1N hovering over the gate doesn't cover the tool.
 */
const GATE_IN_FRONT = new Vector3(3.5, 0, 3.5);
/** The first tool in the row. */
const FIRST_NODE = new Vector3(2, 0, -2);

/** Where Version A sits on the grid: D3V1N's home on the left, then each tool behind its own gate, in a row. */
export const A_LAYOUT = {
  home: FIRST_NODE.clone().add(GATE_IN_FRONT).addScaledVector(STEP, -1.2),
  nodes: A_KINDS.map((_, i) => FIRST_NODE.clone().addScaledVector(STEP, i)),
  gates: A_KINDS.map((_, i) => FIRST_NODE.clone().addScaledVector(STEP, i).add(GATE_IN_FRONT)),
};
/** Middle of the whole layout, for a fixed camera that frames all of it. */
export const A_CENTER = A_LAYOUT.home.clone().lerp(A_LAYOUT.nodes[A_KINDS.length - 1].clone().add(GATE_IN_FRONT.clone().multiplyScalar(0.5)), 0.5);

/**
 * The ticket waits beside its tool, screen-right of it (toward Notion, where
 * its link points), clear of D3V1N hovering over the node.
 */
const TICKET_BESIDE = STEP.clone().multiplyScalar(0.5);
const TICKET_SCALE = 0.7;
/** How long the gate thinks: with the flight there, a crossing takes about three seconds. */
const THINK_SECONDS = 1.2;
/** Carried products stack above D3V1N (clear of its name tag), in its own hover frame. */
const STACK_FROM = 1.7;
const STACK_STEP = 0.5;
const CARRY_SCALE = 2;

/** One tool on the row: its node, its gate, and D3V1N's link to that gate. */
interface Stop {
  kind: SystemKind;
  node: SystemNode;
  gate: Gate;
  signal: AttachedSignal;
}

/**
 * The story told one to one (ILI-962 onward): one agent, one ticket, done
 * two ways. Version A is the enclosed version: D3V1N's home on the left, and
 * Linear, Notion, Figma and GitHub in a row, each behind a gate of its own.
 * Only what this ticket's work touches is on the grid; one thing moves at a
 * time; the camera never moves.
 *
 * `play(through)` runs the beats in order up to and including `through`;
 * `reset()` puts the stage back for another run.
 */
export class OneTicket {
  readonly d3v1n: SpawnedDrone;
  readonly stops: Stop[];
  readonly ticket = new Ticket(ILI_990);
  /** The ticket's link onward to the Notion PRD: shows once D3V1N has read it. */
  readonly link: Group;
  /** What D3V1N is carrying, bottom of the stack first. */
  readonly carried: Product[] = [];

  constructor(private readonly stage: SceneHost) {
    this.d3v1n = spawnDrone(stage, A_LAYOUT.home.x, A_LAYOUT.home.z, { name: 'D3V1N', showLabel: true, status: 'waiting' });
    this.stops = A_KINDS.map((kind, i) => {
      const node = new SystemNode({ kind });
      node.position.copy(A_LAYOUT.nodes[i]);
      const gate = new Gate();
      gate.position.copy(A_LAYOUT.gates[i]);
      const animator = new GateAnimator(gate);
      stage.onTick((dt) => animator.update(dt));
      stage.add(node, gate);
      return { kind, node, gate, signal: attachSignal(stage, this.drone, gate) };
    });
    this.ticket.scale.setScalar(TICKET_SCALE);
    this.ticket.visible = false;
    this.link = linkMarker('notion');
    this.link.visible = false;
    this.ticket.card.add(this.link);
    stage.add(this.ticket);
    stage.onTick((dt) => this.ticket.update(dt));
  }

  get drone(): Drone {
    return this.d3v1n.drone;
  }

  stop(kind: SystemKind): Stop {
    const stop = this.stops.find((s) => s.kind === kind);
    if (!stop) throw new Error(`OneTicket: no ${kind} on the row`);
    return stop;
  }

  /** Play from the top through `through`, in order. */
  async play(through: OneTicketBeat = ONE_TICKET_BEATS[ONE_TICKET_BEATS.length - 1]): Promise<void> {
    const upTo = ONE_TICKET_BEATS.indexOf(through);
    await this.ticketLands();
    if (upTo < 1) return;
    await wait(this.stage, 0.5);
    await this.readTicket();
  }

  /**
   * A1: ILI-990 lands in Linear, beside the Linear node, and pings
   * D3V1N at home: it's assigned to D3V1N.
   */
  private async ticketLands(): Promise<void> {
    const { stage, ticket, drone } = this;
    await dropTicket(stage, ticket, this.stop('linear').node.position.clone().add(TICKET_BESIDE));
    await handOff(stage, ticket, drone);
  }

  /**
   * A2: D3V1N crosses the Linear gate (yellow, then green), goes on to the
   * node and reads ILI-990: a copy of the issue lifts off the ticket onto
   * D3V1N's stack, and the ticket shows its link onward to Notion. Then
   * D3V1N goes back out through the gate and home, carrying it.
   */
  private async readTicket(): Promise<void> {
    const { stage, drone, ticket } = this;
    const linear = this.stop('linear');
    await accessCheck(stage, drone, linear.gate, { thinkSeconds: THINK_SECONDS });
    await wait(stage, 0.4);
    await fly(stage, DroneFlight.to(drone, linear.node.position));
    drone.status = 'waiting';
    // Read it: the ticket lights up and its issue lifts onto D3V1N's stack.
    ticket.glow = 1;
    await this.pickUp(new Product('linear'), ticket.card);
    // The ticket links on to the PRD in Notion.
    this.link.visible = true;
    await tween(stage, 0.35, (t) => this.link.scale.setScalar(Math.max(0.001, t)));
    await wait(stage, 0.6);
    // Out the way it came: back through the gate, which closes behind it, and home.
    drone.status = 'working';
    await fly(stage, DroneFlight.to(drone, linear.gate.position));
    linear.gate.state = 'off';
    await fly(stage, DroneFlight.to(drone, A_LAYOUT.home));
    drone.status = 'waiting';
  }

  /** A product rises from `from` onto the top of D3V1N's carried stack. */
  private async pickUp(product: Product, from: Group): Promise<void> {
    const { stage, drone } = this;
    const start = from.getWorldPosition(new Vector3());
    drone.rig.hover.worldToLocal(start);
    const slot = new Vector3(0, STACK_FROM + this.carried.length * STACK_STEP, 0);
    // Products face the camera on their own; under the drone's own turn they'd face it twice.
    product.rotation.y -= drone.rotation.y;
    drone.rig.hover.add(product);
    this.carried.push(product);
    await tween(stage, 0.7, (t) => {
      const e = t * t * (3 - 2 * t);
      product.position.lerpVectors(start, slot, e);
      product.position.y += Math.sin(t * Math.PI) * 0.4;
      product.scale.setScalar(CARRY_SCALE * (0.5 + 0.5 * e));
    });
    drone.flash = 1;
  }

  /** Clear the stage back to before the ticket landed. */
  async reset(): Promise<void> {
    const { stage, ticket, drone } = this;
    await tween(stage, 0.6, (t) => {
      ticket.opacity = Math.min(ticket.opacity, 1 - t);
      for (const p of this.carried) p.scale.setScalar(CARRY_SCALE * Math.max(0.001, 1 - t));
    });
    for (const p of this.carried.splice(0)) p.dispose();
    ticket.visible = false;
    ticket.opacity = 1;
    this.link.visible = false;
    for (const { gate } of this.stops) gate.state = 'off';
    drone.position.copy(A_LAYOUT.home);
    drone.status = 'waiting';
    this.d3v1n.animator.restart();
  }
}

/**
 * A link on a ticket to another system's doc: a short graphite stub off the
 * card's right edge, ending in a small copy of that system's product. It
 * says "there's more over there" without going anywhere yet.
 */
function linkMarker(kind: SystemKind): Group {
  const marker = new Group();
  const stubEnd = new Vector3(0.5, 0, 0);
  const material = new MeshBasicMaterial({ color: NEUTRAL.graphite });
  const stub = new Mesh(new TubeGeometry(new LineCurve3(new Vector3(0, 0, 0), stubEnd), 1, 0.025, 6), material);
  marker.add(stub);
  const doc = new Product(kind);
  doc.position.copy(stubEnd).add(new Vector3(0.3, 0, 0));
  doc.rotation.y = 0;
  doc.scale.setScalar(2.2);
  marker.add(doc);
  // Off the card's right edge (the card faces the camera, so its right is screen-right).
  const face = new Group();
  face.rotation.y = Math.PI / 4;
  face.add(marker);
  marker.position.set(0.55, 0.05, 0);
  return face;
}
