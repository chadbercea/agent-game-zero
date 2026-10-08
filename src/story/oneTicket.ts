import { Group, LineCurve3, Mesh, MeshBasicMaterial, TubeGeometry, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { DroneFlight, FLIGHT_SPEED } from '../animation/DroneFlight';
import { GateAnimator } from '../animation/GateAnimator';
import { NEUTRAL } from '../core/palette';
import { BIG_BLOCK } from '../primitives/assembler/Assembler';
import { Branch } from '../primitives/branch/Branch';
import { Gate } from '../primitives/gate/Gate';
import type { Drone } from '../primitives/drone/Drone';
import type { SystemKind } from '../primitives/node/emblems';
import { SystemNode } from '../primitives/node/SystemNode';
import { Product, productMaterial } from '../primitives/product/Product';
import { Ticket } from '../primitives/ticket/Ticket';
import { type AttachedSignal, attachSignal } from '../stage/attachSignal';
import { type SpawnedDrone, spawnDrone } from '../stage/spawnDrone';
import type { SceneHost } from '../stage/Stage';
import { accessCheck } from './accessCheck';
import { dropTicket, handOff } from './request';
import { fly, tween, wait } from './timeline';

/** The one ticket's beats, in order (Version A for now). */
export const ONE_TICKET_BEATS = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'] as const;
export type OneTicketBeat = (typeof ONE_TICKET_BEATS)[number];

/** The work in Version A: a Linear issue, assigned to D3V1N. */
export const ILI_990 = { key: 'ILI-990', title: 'Add dark mode' };
/** The PRD the ticket links to, in Notion. */
export const DARK_MODE_PRD = { key: 'PRD', title: 'Dark mode' };
/** The pull request D3V1N opens in GitHub. */
export const DARK_MODE_PR = { key: 'PR', title: 'ILI-990 Add dark mode' };

/** Version A's tools, in the order D3V1N visits them, left to right on screen. */
export const A_KINDS: readonly SystemKind[] = ['linear', 'notion', 'figma', 'github'];

/** Screen-right on the floor, one step between tools in the row. */
const STEP = new Vector3(3, 0, -3);
/**
 * A tool's gate stands this far in front of it (toward the camera, down on
 * screen): far enough that D3V1N hovering over the gate doesn't cover the tool.
 */
const GATE_IN_FRONT = new Vector3(3.5, 0, 3.5);
/**
 * D3V1N's home: the first thing on the grid, so it sits at the origin, dead
 * center of the fixed camera (ILI-977). Everything else lays out from it.
 */
const HOME = new Vector3(0, 0, 0);
/** The first gate stands a step and a bit screen-right of home, in front of the row of tools. */
const FIRST_GATE = new Vector3(3.5, 0, -3.5);
/** The first tool in the row, behind its gate. */
const FIRST_NODE = FIRST_GATE.clone().sub(GATE_IN_FRONT);

/** Where Version A sits on the grid: D3V1N's home at the center, then each tool behind its own gate, in a row to the right. */
export const A_LAYOUT = {
  home: HOME.clone(),
  nodes: A_KINDS.map((_, i) => FIRST_NODE.clone().addScaledVector(STEP, i)),
  gates: A_KINDS.map((_, i) => FIRST_NODE.clone().addScaledVector(STEP, i).add(GATE_IN_FRONT)),
};
/** The fixed camera frames home: the first thing placed sits dead center, and the row grows out to the right from it. */
export const A_CENTER = A_LAYOUT.home.clone();

/**
 * The ticket waits beside its tool, screen-right of it (toward Notion, where
 * its link points), clear of D3V1N hovering over the node.
 */
const TICKET_BESIDE = STEP.clone().multiplyScalar(0.5);
export const TICKET_SCALE = 0.7;
/** How long the gate thinks: with the flights either side, a crossing takes about three seconds. */
export const THINK_SECONDS = 0.9;
/**
 * No leg of a trip (home to gate, gate to node, and back) takes longer than
 * this: far stops are flown faster, so Version A stays about 30 s.
 */
export const LEG_SECONDS = 0.75;
/** Carried products stack above D3V1N (clear of its name tag), in its own hover frame. */
export const STACK_FROM = 1.7;
export const STACK_STEP = 0.5;
export const CARRY_SCALE = 2;
/** The plan: one bigger block, the carried stack merged. */
const PLAN_SCALE = 1.6;
/** D3V1N's branch grows off GitHub this far, up-left on screen along a grid line, into open floor. */
const BRANCH_LENGTH = 2.5;
/** Commits land on the branch at these points along it. */
const COMMITS_AT = [0.35, 0.65, 0.95];

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
  /** The PRD in Notion: already there, waiting beside its node. */
  readonly prd = new Ticket(DARK_MODE_PRD);
  /** The PRD's acceptance criteria link onward to the design in Figma: shows once D3V1N has read it. */
  readonly prdLink: Group;
  /** What D3V1N is carrying, bottom of the stack first. */
  readonly carried: Product[] = [];
  /** The plan: what the carried stack merges into (A5). Carried from then on. */
  readonly plan: Mesh;
  /** D3V1N's branch off GitHub (A6). */
  readonly branch: Branch;
  /** Commits landed on the branch. */
  readonly commits: Product[] = [];
  /** The pull request, at the end of the branch (A7). */
  readonly pr = new Ticket(DARK_MODE_PR);

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
    this.prd.scale.setScalar(TICKET_SCALE);
    this.prd.position.copy(this.stop('notion').node.position).add(TICKET_BESIDE);
    this.prdLink = linkMarker('figma');
    this.prdLink.visible = false;
    this.prd.card.add(this.prdLink);
    this.plan = planBlock(this.drone);
    const github = this.stop('github').node.position;
    this.branch = new Branch(
      new LineCurve3(github.clone().add(new Vector3(-0.5, 0, 0)), github.clone().add(new Vector3(-0.5 - BRANCH_LENGTH, 0, 0))),
      NEUTRAL.packet,
    );
    this.pr.scale.setScalar(TICKET_SCALE);
    this.pr.visible = false;
    stage.add(this.ticket, this.prd, this.branch, this.pr);
    stage.onTick((dt) => {
      this.ticket.update(dt);
      this.prd.update(dt);
      this.pr.update(dt);
    });
  }

  get drone(): Drone {
    return this.d3v1n.drone;
  }

  stop(kind: SystemKind): Stop {
    const stop = this.stops.find((s) => s.kind === kind);
    if (!stop) throw new Error(`OneTicket: no ${kind} on the row`);
    return stop;
  }

  /**
   * Play the beats in order through `through`. With `from`, the beats before
   * it are already done when the run starts (see `prime`), so a segment can
   * play on its own.
   */
  async play(
    through: OneTicketBeat = ONE_TICKET_BEATS[ONE_TICKET_BEATS.length - 1],
    from: OneTicketBeat = ONE_TICKET_BEATS[0],
  ): Promise<void> {
    const beats: Record<OneTicketBeat, () => Promise<void>> = {
      a1: () => this.ticketLands(),
      a2: () => this.readTicket(),
      a3: () => this.readPrd(),
      a4: () => this.pullDesign(),
      a5: () => this.makePlan(),
      a6: () => this.writeCode(),
      a7: () => this.checkIn(),
    };
    const first = ONE_TICKET_BEATS.indexOf(from);
    const last = ONE_TICKET_BEATS.indexOf(through);
    this.prime(first);
    for (let i = first; i <= last; i++) {
      if (i > first) await wait(this.stage, 0.3);
      await beats[ONE_TICKET_BEATS[i]]();
    }
  }

  /** Put the stage where it stands once the first `done` beats have played, without playing them. */
  private prime(done: number): void {
    if (done < 1) return;
    this.ticket.position.copy(this.stop('linear').node.position).add(TICKET_BESIDE);
    this.ticket.visible = true;
    if (done < 2) return;
    const kinds: SystemKind[] = (['linear', 'notion', 'figma'] as const).slice(0, done - 1);
    for (const kind of kinds) {
      const product = new Product(kind);
      this.stack(product);
      product.position.y = STACK_FROM + (this.carried.length - 1) * STACK_STEP;
      product.scale.setScalar(CARRY_SCALE);
    }
    this.link.visible = true;
    if (done >= 3) this.prdLink.visible = true;
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
   * D3V1N flies home, carrying it.
   */
  private async readTicket(): Promise<void> {
    await this.visit('linear', async () => {
      this.ticket.glow = 1;
      await this.pickUp(new Product('linear'), this.ticket.card);
      await this.showLink(this.link);
    });
  }

  /**
   * A3: D3V1N follows the ticket's link to Notion (the link pulses as it
   * sets off), crosses Notion's own gate, and reads the PRD: a page lifts
   * onto its stack, and the PRD's acceptance criteria show their link on to
   * Figma. Then back out and home.
   */
  private async readPrd(): Promise<void> {
    await this.follow(this.link);
    await this.visit('notion', async () => {
      this.prd.glow = 1;
      await this.pickUp(new Product('notion'), this.prd.card);
      await this.showLink(this.prdLink);
    });
  }

  /**
   * A4: D3V1N follows the PRD's link to Figma, crosses Figma's own gate (its
   * MCP), and pulls the design off the node onto its stack: ticket, PRD,
   * design. Then back out and home.
   */
  private async pullDesign(): Promise<void> {
    await this.follow(this.prdLink);
    await this.visit('figma', async () => {
      await this.pickUp(new Product('figma'), this.stop('figma').node.emblem);
    });
  }

  /**
   * A5: the plan. Home, D3V1N stops; its carried stack (ticket, PRD,
   * design) closes up and merges into one bigger block. About 1.5 s.
   */
  private async makePlan(): Promise<void> {
    this.drone.status = 'waiting';
    await mergeIntoPlan(this.stage, this.drone, this.carried, this.plan);
  }

  /**
   * A6: D3V1N crosses GitHub's own gate. At the node, its branch grows off
   * GitHub, and commits drop from D3V1N onto it, one after another.
   */
  private async writeCode(): Promise<void> {
    await this.visit('github', async () => {
      const { stage, branch, drone } = this;
      drone.status = 'working';
      let landed = 0;
      await tween(stage, 1.9, (t) => {
        branch.drawn = t;
        while (landed < COMMITS_AT.length && t >= COMMITS_AT[landed]) void this.commit(COMMITS_AT[landed++]);
      });
      await wait(stage, 0.5);
    });
  }

  /**
   * A7: check it in. The pull request opens at the end of the branch; then
   * D3V1N goes back through the Linear gate and updates ILI-990 by hand
   * (the ticket glows green), and home.
   */
  private async checkIn(): Promise<void> {
    const { stage, pr, branch, ticket, drone } = this;
    await dropTicket(stage, pr, branch.curve.getPointAt(1).add(new Vector3(0, 0, -0.6)));
    pr.glow = 1;
    await wait(stage, 0.4);
    await this.visit('linear', async () => {
      drone.status = 'working';
      drone.flash = 1;
      await tween(stage, 0.9, () => (ticket.glow = 1));
    });
  }

  /** A commit drops from D3V1N onto the branch at `at` (0–1 along it). */
  private async commit(at: number): Promise<void> {
    const { stage, drone } = this;
    const commit = new Product('github');
    const start = drone.rig.hover.getWorldPosition(new Vector3());
    const end = this.branch.curve.getPointAt(at).setY(0.2);
    commit.scale.setScalar(1.6);
    commit.position.copy(start);
    stage.add(commit);
    this.commits.push(commit);
    await tween(stage, 0.5, (t) => {
      commit.position.lerpVectors(start, end, t * t);
    });
  }

  /**
   * One stop on the row: from home, D3V1N crosses the tool's own gate
   * (yellow, then green), goes on to the node and does `work` there; then
   * the gate closes behind it and it flies straight home.
   */
  private async visit(kind: SystemKind, work: () => Promise<void>): Promise<void> {
    const { stage, drone } = this;
    const { gate, node } = this.stop(kind);
    drone.status = 'working';
    gate.state = 'off';
    await this.hop(gate.position);
    await accessCheck(stage, drone, gate, { thinkSeconds: THINK_SECONDS });
    await wait(stage, 0.25);
    await this.hop(node.position);
    drone.status = 'waiting';
    await work();
    await wait(stage, 0.35);
    // Done here: the gate closes behind it, and it flies straight home.
    drone.status = 'working';
    gate.state = 'off';
    await this.hop(A_LAYOUT.home);
    drone.status = 'waiting';
  }

  private hop(to: Vector3): Promise<void> {
    return hop(this.stage, this.drone, to);
  }

  /** A link pops up on the doc D3V1N just read. */
  private async showLink(link: Group): Promise<void> {
    link.visible = true;
    await tween(this.stage, 0.35, (t) => link.scale.setScalar(Math.max(0.001, t)));
  }

  /** D3V1N follows a link: it pulses, and D3V1N lights up as it takes it. */
  private async follow(link: Group): Promise<void> {
    this.drone.flash = 1;
    await tween(this.stage, 0.4, (t) => link.scale.setScalar(1 + Math.sin(t * Math.PI) * 0.35));
  }

  /** A product rises from `from` onto the top of D3V1N's carried stack. */
  private async pickUp(product: Product, from: Group): Promise<void> {
    const { stage, drone } = this;
    const start = from.getWorldPosition(new Vector3());
    drone.rig.hover.worldToLocal(start);
    const slot = new Vector3(0, STACK_FROM + this.carried.length * STACK_STEP, 0);
    this.stack(product);
    await tween(stage, 0.7, (t) => {
      const e = t * t * (3 - 2 * t);
      product.position.lerpVectors(start, slot, e);
      product.position.y += Math.sin(t * Math.PI) * 0.4;
      product.scale.setScalar(CARRY_SCALE * (0.5 + 0.5 * e));
    });
    drone.flash = 1;
  }

  /** Put a product on top of D3V1N's carried stack (where it lands is up to the caller). */
  private stack(product: Product): void {
    // Products face the camera on their own; under the drone's own turn they'd face it twice.
    product.rotation.y -= this.drone.rotation.y;
    this.drone.rig.hover.add(product);
    this.carried.push(product);
  }

  /** Clear the stage back to before the ticket landed. */
  async reset(): Promise<void> {
    const { stage, ticket, drone } = this;
    const { plan, pr, branch } = this;
    const planScale = plan.scale.x;
    await tween(stage, 0.6, (t) => {
      ticket.opacity = Math.min(ticket.opacity, 1 - t);
      pr.opacity = Math.min(pr.opacity, 1 - t);
      branch.material.opacity = Math.min(branch.material.opacity, 0.8 * (1 - t));
      for (const p of this.carried) p.scale.setScalar(CARRY_SCALE * Math.max(0.001, 1 - t));
      for (const c of this.commits) c.scale.setScalar(1.6 * Math.max(0.001, 1 - t));
      plan.scale.setScalar(Math.max(0.001, planScale * (1 - t)));
    });
    for (const p of this.carried.splice(0)) p.dispose();
    for (const c of this.commits.splice(0)) c.dispose();
    plan.visible = false;
    pr.visible = false;
    pr.opacity = 1;
    branch.drawn = 0;
    branch.material.opacity = 0.8;
    ticket.visible = false;
    ticket.opacity = 1;
    this.link.visible = false;
    this.prdLink.visible = false;
    for (const { gate } of this.stops) gate.state = 'off';
    drone.position.copy(A_LAYOUT.home);
    drone.status = 'waiting';
    this.d3v1n.animator.restart();
  }
}

/** The plan, hidden until the carried stack merges into it: one bigger block, riding with `drone`. */
export function planBlock(drone: Drone): Mesh {
  const plan = new Mesh(new RoundedBoxGeometry(BIG_BLOCK, BIG_BLOCK, BIG_BLOCK, 3, 0.05), productMaterial());
  plan.castShadow = true;
  plan.visible = false;
  drone.rig.hover.add(plan);
  return plan;
}

/**
 * The plan (both versions): a drone's carried stack closes up and merges
 * into one bigger block, which pops in at the bottom of the stack. About
 * 1.5 s. Empties `carried`.
 */
export async function mergeIntoPlan(stage: SceneHost, drone: Drone, carried: Product[], plan: Mesh): Promise<void> {
  const parts = [...carried];
  const from = parts.map((p) => p.position.clone());
  const center = new Vector3(0, STACK_FROM + ((parts.length - 1) * STACK_STEP) / 2, 0);
  await tween(stage, 0.9, (t) => {
    const e = t * t * (3 - 2 * t);
    parts.forEach((p, i) => {
      p.position.lerpVectors(from[i], center, e);
      p.scale.setScalar(CARRY_SCALE * (1 - 0.6 * e));
    });
  });
  for (const p of carried.splice(0)) p.dispose();
  plan.position.copy(center);
  plan.visible = true;
  drone.flash = 1;
  await tween(stage, 0.6, (t) => {
    plan.scale.setScalar(PLAN_SCALE * (0.4 + 0.6 * easeOutBack(t)));
    plan.position.y = center.y + (STACK_FROM - center.y) * t;
  });
}

/** A drone hops straight to a floor point: at cruise speed, or faster for a long leg (see LEG_SECONDS). */
export function hop(stage: SceneHost, drone: Drone, to: Vector3): Promise<void> {
  const distance = Math.hypot(to.x - drone.position.x, to.z - drone.position.z);
  return fly(stage, DroneFlight.to(drone, to, { speed: Math.max(FLIGHT_SPEED, distance / LEG_SECONDS) }));
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

/** Overshoot a touch past the end, then settle. */
function easeOutBack(t: number): number {
  const c = 1.6;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}
