import { type Group, LineCurve3, type Mesh, Vector3 } from 'three';
import { DroneFlight } from '../animation/DroneFlight';
import { GateAnimator } from '../animation/GateAnimator';
import { NEUTRAL } from '../core/palette';
import { Branch } from '../primitives/branch/Branch';
import { reversed } from '../primitives/branch/gridPath';
import { type Drone, SUB_AGENT_SCALE } from '../primitives/drone/Drone';
import { Gate } from '../primitives/gate/Gate';
import type { SystemKind } from '../primitives/node/emblems';
import type { SystemNode } from '../primitives/node/SystemNode';
import { Product } from '../primitives/product/Product';
import { Ticket } from '../primitives/ticket/Ticket';
import { type AttachedSignal, attachSignal } from '../stage/attachSignal';
import { type SpawnedDrone, spawnDrone } from '../stage/spawnDrone';
import type { SceneHost } from '../stage/Stage';
import { accessCheck } from './accessCheck';
import { shoot } from './beam';
import { ACT1_GATE, D3V1N_KINDS, D3V1N_REQUEST, HOME, storyLayout } from './layout';
import {
  CARRY_SCALE,
  DARK_MODE_PR,
  DARK_MODE_PRD,
  ILI_990,
  linkMarker,
  mergeIntoPlan,
  planBlock,
  STACK_FROM,
  STACK_STEP,
  TICKET_SCALE,
} from './oneTicket';
import { dropTicket, handOff } from './request';
import { revealNode } from './revealMap';
import { SystemMap } from './SystemMap';
import { fly, tween, wait } from './timeline';

/** Version A's beats on the Two Systems grid, in order. */
export const TWO_SYSTEMS_A_BEATS = ['ticket', 'access', 'linear', 'notion', 'figma', 'plan', 'github', 'update'] as const;
export type TwoSystemsABeat = (typeof TWO_SYSTEMS_A_BEATS)[number];

/** A sub-agent buds off D3V1N this small and grows on the way out. */
const BUD = 0.3;
const SUB_SPEED = 4.2;
/** Products ride the branch line back at this speed. */
const RIDE_SPEED = 4.5;
/** A doc waits just past its tool on the side away from the gate, clear of the sub-agent over it and the other tools. */
const DOC_OUT = 1.3;
const TOWARD_CAMERA = new Vector3(1, 0, 1).normalize();
const SCREEN_RIGHT = new Vector3(1, 0, -1).normalize();
/** D3V1N's branch grows off GitHub this long, away from the gate. */
const BRANCH_LENGTH = 2.2;
const COMMITS_AT = [0.35, 0.65, 0.95];

/**
 * The story told again on the Two Systems grid (ILI-979), Version A: D3V1N's
 * own system, one gate, its tools behind it laid out by the grid guide
 * (Linear, Notion, Figma, GitHub). Every tool comes up only when it's
 * called, its line and grid drawing in and fading; sub-agents fly straight;
 * what they gather rides the line back to D3V1N. One thing moves at a time.
 *
 * The Atlassian system isn't on the grid in Version A; it joins in Version B.
 */
export class TwoSystemsStory {
  readonly d3v1n: SpawnedDrone;
  readonly gate = new Gate();
  readonly map: SystemMap;
  readonly signal: AttachedSignal;
  readonly ticket = new Ticket(ILI_990);
  readonly ticketLink: Group;
  readonly prd = new Ticket(DARK_MODE_PRD);
  readonly prdLink: Group;
  readonly pr = new Ticket(DARK_MODE_PR);
  /** What D3V1N carries, bottom first. */
  readonly carried: Product[] = [];
  readonly plan: Mesh;
  branch: Branch | null = null;
  readonly commits: Product[] = [];
  /** Tools called up so far, in order. */
  readonly called: SystemKind[] = [];
  private subs = 0;

  constructor(private readonly stage: SceneHost) {
    this.d3v1n = spawnDrone(stage, HOME.x, HOME.z, { name: 'D3V1N', showLabel: true, status: 'waiting' });
    this.gate.position.copy(ACT1_GATE);
    const animator = new GateAnimator(this.gate);
    stage.onTick((dt) => animator.update(dt));
    stage.add(this.gate);
    const {
      maps: [layout],
    } = storyLayout();
    this.map = new SystemMap(stage, this.gate, D3V1N_KINDS, { layout });
    this.map.hide();
    this.signal = attachSignal(stage, this.drone, this.gate);
    for (const doc of [this.ticket, this.prd, this.pr]) {
      doc.scale.setScalar(TICKET_SCALE);
      doc.visible = false;
      stage.add(doc);
    }
    this.ticketLink = linkMarker('notion');
    this.prdLink = linkMarker('figma');
    this.ticket.card.add(this.ticketLink);
    this.prd.card.add(this.prdLink);
    this.ticketLink.visible = this.prdLink.visible = false;
    this.plan = planBlock(this.drone);
    stage.onTick((dt) => {
      this.ticket.update(dt);
      this.prd.update(dt);
      this.pr.update(dt);
    });
  }

  get drone(): Drone {
    return this.d3v1n.drone;
  }

  node(kind: SystemKind): SystemNode {
    return this.map.nodes[D3V1N_KINDS.indexOf(kind)];
  }

  /** Play Version A through `through`. */
  async play(through: TwoSystemsABeat = 'update'): Promise<void> {
    const beats: Record<TwoSystemsABeat, () => Promise<void>> = {
      ticket: () => this.ticketLands(),
      access: () => this.access(),
      linear: () => this.readTicket(),
      notion: () => this.readPrd(),
      figma: () => this.pullDesign(),
      plan: () => this.makePlan(),
      github: () => this.writeCode(),
      update: () => this.updateLinear(),
    };
    const last = TWO_SYSTEMS_A_BEATS.indexOf(through);
    for (let i = 0; i <= last; i++) {
      if (i > 0) await wait(this.stage, 0.3);
      await beats[TWO_SYSTEMS_A_BEATS[i]]();
    }
  }

  /** 1. ILI-990 lands at D3V1N, at home, and is handed to it. */
  private async ticketLands(): Promise<void> {
    await dropTicket(this.stage, this.ticket, D3V1N_REQUEST);
    await handOff(this.stage, this.ticket, this.drone);
  }

  /** 2. D3V1N flies to its one gate and gets access: yellow, then green. */
  private async access(): Promise<void> {
    await accessCheck(this.stage, this.drone, this.gate, { thinkSeconds: 1 });
  }

  /** 3. Linear comes up; the ticket goes to live there; a sub-agent reads it, and the issue rides the line back. */
  private async readTicket(): Promise<void> {
    await this.call('linear');
    await this.glide(this.ticket, this.besideTool('linear'));
    await this.visit('linear', async () => {
      this.ticket.glow = 1;
      await this.showLink(this.ticketLink);
    });
  }

  /** 4. Notion comes up with the PRD; a sub-agent reads it (its criteria link to Figma), and the PRD rides back. */
  private async readPrd(): Promise<void> {
    await this.call('notion');
    this.prd.position.copy(this.besideTool('notion'));
    this.prd.visible = true;
    await tween(this.stage, 0.35, (t) => (this.prd.opacity = t));
    await this.visit('notion', async () => {
      this.prd.glow = 1;
      await this.showLink(this.prdLink);
    });
  }

  /** 5. Figma comes up; a sub-agent pulls the design, and it rides back. */
  private async pullDesign(): Promise<void> {
    await this.call('figma');
    await this.visit('figma', async () => {
      await wait(this.stage, 0.4);
    });
  }

  /** 6. Plan: D3V1N's three products merge into one. */
  private async makePlan(): Promise<void> {
    this.drone.status = 'waiting';
    await mergeIntoPlan(this.stage, this.drone, this.carried, this.plan);
  }

  /** 7. GitHub comes up; a sub-agent branches, commits land on the branch, and the PR opens. */
  private async writeCode(): Promise<void> {
    const { stage } = this;
    await this.call('github');
    const github = this.node('github');
    const out = github.position.clone().sub(this.gate.position);
    const dir = Math.abs(out.x) >= Math.abs(out.z) ? new Vector3(Math.sign(out.x), 0, 0) : new Vector3(0, 0, Math.sign(out.z));
    const from = github.position.clone().addScaledVector(dir, 0.6);
    const branch = new Branch(new LineCurve3(from, from.clone().addScaledVector(dir, BRANCH_LENGTH)), NEUTRAL.packet);
    stage.add(branch);
    this.branch = branch;
    await this.goWork('github', async (sub) => {
      let landed = 0;
      await tween(stage, 1.9, (t) => {
        branch.drawn = t;
        while (landed < COMMITS_AT.length && t >= COMMITS_AT[landed]) void this.commit(sub, COMMITS_AT[landed++]);
      });
      await wait(stage, 0.5);
      await dropTicket(stage, this.pr, branch.curve.getPointAt(1).add(new Vector3(-0.4, 0, -0.4)));
      this.pr.glow = 1;
    });
  }

  /** 8. A sub-agent flies back to Linear and updates ILI-990 by hand: the ticket glows green. */
  private async updateLinear(): Promise<void> {
    await this.goWork('linear', async () => {
      await tween(this.stage, 1, () => (this.ticket.glow = 1));
    });
  }

  /** A tool comes up when it's called: its line draws out from the gate over the grid, and it rises. */
  private async call(kind: SystemKind): Promise<void> {
    await revealNode(this.stage, this.map, D3V1N_KINDS.indexOf(kind));
    this.called.push(kind);
  }

  /** A sub-agent goes to a tool, does `work` there, sends what it gathered back along the line, and comes home. */
  private async visit(kind: SystemKind, work: () => Promise<void>): Promise<void> {
    await this.goWork(kind, async () => {
      await work();
      await this.rideBack(kind);
    });
  }

  /** A sub-agent buds off D3V1N, flies straight to the tool, does `work`, flies straight back and dissolves. */
  private async goWork(kind: SystemKind, work: (sub: Drone) => Promise<void>): Promise<void> {
    const { stage, drone } = this;
    const i = D3V1N_KINDS.indexOf(kind);
    const node = this.map.nodes[i];
    this.map.setActive(i, true);
    const sub = spawnDrone(stage, drone.position.x, drone.position.z, {
      name: `${drone.name}.${++this.subs}`,
      lineage: drone.lineage,
      subAgent: true,
      status: 'working',
    });
    drone.flash = 1;
    await Promise.all([
      fly(stage, DroneFlight.to(sub.drone, node.position, { speed: SUB_SPEED })),
      tween(stage, 0.6, (t) => sub.drone.scale.setScalar(SUB_AGENT_SCALE * (BUD + (1 - BUD) * t))),
    ]);
    node.light = 'working';
    sub.drone.status = 'waiting';
    await work(sub.drone);
    sub.drone.status = 'working';
    await fly(stage, DroneFlight.to(sub.drone, drone.position, { speed: SUB_SPEED }));
    await tween(stage, 0.35, (t) => {
      sub.drone.scale.setScalar(SUB_AGENT_SCALE * (1 - 0.7 * t));
      sub.drone.fade = 1 - t;
    });
    sub.despawn();
    drone.flash = 1;
    node.light = 'off';
    this.map.setActive(i, false);
  }

  /** What the sub-agent gathered rides the branch line back to the gate, and onto D3V1N's stack. */
  private async rideBack(kind: SystemKind): Promise<void> {
    const route = reversed(this.map.routes[D3V1N_KINDS.indexOf(kind)]);
    await shoot(this.stage, route, RIDE_SPEED, undefined, kind);
    const product = new Product(kind);
    product.rotation.y -= this.drone.rotation.y;
    product.position.set(0, STACK_FROM + this.carried.length * STACK_STEP, 0);
    this.drone.rig.hover.add(product);
    this.carried.push(product);
    await tween(this.stage, 0.3, (t) => product.scale.setScalar(Math.max(0.001, CARRY_SCALE * t)));
    this.drone.flash = 1;
  }

  private async commit(sub: Drone, at: number): Promise<void> {
    const commit = new Product('github');
    const start = sub.rig.hover.getWorldPosition(new Vector3());
    const end = this.branch!.curve.getPointAt(at).setY(0.2);
    commit.scale.setScalar(1.6);
    this.stage.add(commit);
    this.commits.push(commit);
    await tween(this.stage, 0.5, (t) => commit.position.lerpVectors(start, end, t * t));
  }

  private besideTool(kind: SystemKind): Vector3 {
    const at = this.node(kind).position;
    let out = at.clone().sub(this.gate.position).setY(0).normalize();
    // Straight toward the camera, a hovering card would stand in front of its own tool: put it to the tool's right instead.
    if (out.dot(TOWARD_CAMERA) > 0.5) out = SCREEN_RIGHT.clone();
    return at.clone().addScaledVector(out, DOC_OUT);
  }

  /** A doc glides over the floor to a new spot. */
  private async glide(doc: Ticket, to: Vector3): Promise<void> {
    const from = doc.position.clone();
    await tween(this.stage, 0.9, (t) => doc.position.lerpVectors(from, to, t * t * (3 - 2 * t)));
  }

  private async showLink(link: Group): Promise<void> {
    link.visible = true;
    await tween(this.stage, 0.35, (t) => link.scale.setScalar(Math.max(0.001, t)));
  }

  /** Clear the grid back to before the ticket landed. */
  async reset(): Promise<void> {
    const { stage, drone, plan } = this;
    const planScale = plan.scale.x;
    await tween(stage, 0.5, (t) => {
      for (const d of [this.ticket, this.prd, this.pr]) d.opacity = Math.min(d.opacity, 1 - t);
      for (const p of this.carried) p.scale.setScalar(CARRY_SCALE * Math.max(0.001, 1 - t));
      plan.scale.setScalar(Math.max(0.001, planScale * (1 - t)));
    });
    for (const p of this.carried.splice(0)) p.dispose();
    for (const c of this.commits.splice(0)) c.dispose();
    this.branch?.dispose();
    this.branch = null;
    plan.visible = false;
    for (const d of [this.ticket, this.prd, this.pr]) {
      d.visible = false;
      d.opacity = 1;
    }
    this.ticketLink.visible = this.prdLink.visible = false;
    this.gate.state = 'off';
    this.map.hide();
    this.called.length = 0;
    drone.position.copy(HOME);
    drone.status = 'waiting';
    this.d3v1n.animator.restart();
  }
}
