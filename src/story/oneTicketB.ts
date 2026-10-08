import { type Curve, CurvePath, Group, LineCurve3, type Mesh, Vector3 } from 'three';
import { BEND_RADIUS, NODE_FOOTPRINT } from '../core/grid';
import { NEUTRAL } from '../core/palette';
import { Branch } from '../primitives/branch/Branch';
import { roundedPath } from '../primitives/branch/gridPath';
import type { SharedRun } from '../core/sharedRuns';
import type { Drone } from '../primitives/drone/Drone';
import { Gateway } from '../primitives/gateway/Gateway';
import { GraphEdge } from '../primitives/graph/GraphEdge';
import type { SystemKind } from '../primitives/node/emblems';
import { SystemNode } from '../primitives/node/SystemNode';
import { Product } from '../primitives/product/Product';
import { Ticket } from '../primitives/ticket/Ticket';
import { type SpawnedDrone, spawnDrone } from '../stage/spawnDrone';
import type { SceneHost } from '../stage/Stage';
import { beam, shoot } from './beam';
import { CARRY_SCALE, hop, mergeIntoPlan, planBlock, STACK_FROM, STACK_STEP, TICKET_SCALE } from './oneTicket';
import { dropTicket, handOff } from './request';
import { tween, wait } from './timeline';

/** Version B's beats, in order. */
export const B_BEATS = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'] as const;
export type BBeat = (typeof B_BEATS)[number];

/** The same work as Version A, as a Jira issue assigned to D3V1N. */
export const DEMO_990 = { key: 'DEMO-990', title: 'Add dark mode' };
/** The pull request, carrying the issue key. */
export const DEMO_990_PR = { key: 'PR', title: 'DEMO-990 Add dark mode' };

/** The Atlassian side's tools, as the milestone lists them. */
export const B_KINDS: readonly SystemKind[] = ['jira', 'confluence', 'figma', 'codesearch', 'bitbucket'];

/**
 * The one secured gateway, on the grid between D3V1N's home and the
 * Atlassian side: a glass tunnel three squares long, one lane wide.
 */
export const B_GATEWAY: SharedRun = { along: 'x', from: 2.5, to: 5.5, low: -0.5, high: 0.5 };

/**
 * Where Version B sits on the grid. D3V1N's home on the left; the gateway
 * in the middle; the Atlassian side on the right: Jira straight out of the
 * tunnel, Confluence behind it and Figma beyond, Code search beside Jira and
 * Bitbucket in front of that. Rovo waits down in front, clear of the tunnel and the lines.
 */
export const B_LAYOUT = {
  home: new Vector3(0, 0, 0),
  rovo: new Vector3(7.5, 0, 4.5),
  nodes: {
    jira: new Vector3(8, 0, 0),
    confluence: new Vector3(8, 0, -3),
    figma: new Vector3(11, 0, -3),
    codesearch: new Vector3(11, 0, 0),
    bitbucket: new Vector3(11, 0, 3),
  } as Record<string, Vector3>,
};

/** The Graph Lines that join the Atlassian side, already connected when B starts: the tunnel to Jira, then tool to tool. */
export const B_LINKS: readonly [SystemKind | 'gateway', SystemKind][] = [
  ['gateway', 'jira'],
  ['jira', 'confluence'],
  ['confluence', 'figma'],
  ['jira', 'codesearch'],
  ['codesearch', 'bitbucket'],
];

/** Middle of the whole layout, for a fixed camera that frames all of it. */
export const B_CENTER = new Vector3(5.5, 0, 0);

/** D3V1N waits this far past the tunnel's far end, toward Rovo: out of it (so going back in is a crossing of its own) and clear of the DEMO-990 card. */
const EXIT_CLEAR = new Vector3(0.6, 0, 1.2);
/** The DEMO-990 card waits beside Jira, up-left on screen, clear of Rovo and the lines. */
const TICKET_BESIDE = new Vector3(-1.5, 0, -1.5);
/** D3V1N's branch grows off Bitbucket this far, up-left on screen along a grid line, into open floor. */
const BRANCH_LENGTH = 2;
/** Commits land on the branch at these points along it. */
const COMMITS_AT = [0.35, 0.65, 0.95];
/** What DEMO-990 picks up on its own: the branch, the commits, the pull request. */
export const RECORD = ['branch', 'commits', 'pr'] as const;
/** What Rovo gathers, in the order it stacks: ticket, PRD, design, related issues, code. */
export const B_CONTEXT: readonly { from: SystemKind; product: SystemKind }[] = [
  { from: 'jira', product: 'jira' },
  { from: 'confluence', product: 'confluence' },
  { from: 'figma', product: 'figma' },
  { from: 'codesearch', product: 'jira' },
  { from: 'codesearch', product: 'codesearch' },
];

/**
 * Version B of the one-ticket story (ILI-965 onward): the same work, done
 * with the Atlassian Teamwork Graph. D3V1N crosses one secured gateway and
 * asks Rovo once; Rovo walks lines that are already connected and hands back
 * everything at once. Clean scene, one thing moving at a time, fixed camera.
 */
export class OneTicketB {
  readonly d3v1n: SpawnedDrone;
  readonly rovo: SpawnedDrone;
  readonly gateway = new Gateway(B_GATEWAY);
  readonly nodes = new Map<SystemKind, SystemNode>();
  readonly lines: { from: SystemKind | 'gateway'; to: SystemKind; edge: GraphEdge }[];
  readonly ticket = new Ticket(DEMO_990);
  /** What D3V1N is carrying, bottom of the stack first. */
  readonly carried: Product[] = [];
  /** Tools Rovo has reached on its walk, in order. */
  readonly walked: SystemKind[] = [];
  /** Times D3V1N has entered the tunnel. */
  crossings = 0;
  /** The plan: what the carried stack merges into (B4). */
  readonly plan: Mesh;
  /** D3V1N's branch off Bitbucket (B5). */
  readonly branch: Branch;
  /** Commits landed on the branch. */
  readonly commits: Product[] = [];
  /** The pull request, at the end of the branch (B5). */
  readonly pr = new Ticket(DEMO_990_PR);
  /** The Graph Line from the PR back to DEMO-990 (B6): Jira picking it up on its own. */
  readonly recordLine: GraphEdge;
  /** What DEMO-990 shows it has picked up (B6): branch, commits, PR, under the card. */
  readonly record: Group;

  constructor(private readonly stage: SceneHost) {
    this.d3v1n = spawnDrone(stage, B_LAYOUT.home.x, B_LAYOUT.home.z, { name: 'D3V1N', showLabel: true, status: 'waiting' });
    this.rovo = spawnDrone(stage, B_LAYOUT.rovo.x, B_LAYOUT.rovo.z, { name: 'Rovo', lineage: 'cyan', showLabel: true, status: 'waiting' });
    for (const kind of B_KINDS) {
      const node = new SystemNode({ kind });
      node.position.copy(B_LAYOUT.nodes[kind]);
      this.nodes.set(kind, node);
      stage.add(node);
    }
    // Already secured and connected: built, locked, its lines in and data flowing.
    this.gateway.built = 1;
    this.gateway.lockDrop = 1;
    this.gateway.conduit.streams = 1;
    this.lines = B_LINKS.map(([from, to]) => {
      const edge = new GraphEdge(this.linkPath(from, to));
      edge.drawn = 1;
      stage.add(edge);
      return { from, to, edge };
    });
    this.ticket.scale.setScalar(TICKET_SCALE);
    this.ticket.visible = false;
    this.plan = planBlock(this.drone);
    const bitbucket = B_LAYOUT.nodes.bitbucket;
    const branchFrom = bitbucket.clone().add(new Vector3(-NODE_FOOTPRINT / 2, 0, 0));
    this.branch = new Branch(new LineCurve3(branchFrom, branchFrom.clone().add(new Vector3(-BRANCH_LENGTH, 0, 0))), NEUTRAL.packet);
    this.pr.scale.setScalar(TICKET_SCALE);
    this.pr.visible = false;
    this.recordLine = new GraphEdge(this.recordPath());
    this.recordLine.drawn = 0;
    this.record = recordChips();
    this.record.visible = false;
    this.ticket.card.add(this.record);
    stage.add(this.gateway, this.ticket, this.branch, this.pr, this.recordLine);
    stage.onTick((dt) => {
      this.gateway.update(dt);
      this.ticket.update(dt);
      for (const { edge } of this.lines) edge.update(dt);
      this.recordLine.update(dt);
      this.pr.update(dt);
      this.watchTunnel();
    });
  }

  get drone(): Drone {
    return this.d3v1n.drone;
  }

  node(kind: SystemKind): SystemNode {
    const node = this.nodes.get(kind);
    if (!node) throw new Error(`OneTicketB: no ${kind} on the Atlassian side`);
    return node;
  }

  /**
   * Play the beats in order through `through`. With `from`, the beats before
   * it are already done when the run starts, so a segment can play on its own.
   */
  async play(through: BBeat = B_BEATS[B_BEATS.length - 1], from: BBeat = B_BEATS[0]): Promise<void> {
    const beats: Record<BBeat, () => Promise<void>> = {
      b1: () => this.ticketLands(),
      b2: () => this.askRovo(),
      b3: () => this.connectedContext(),
      b4: () => this.makePlan(),
      b5: () => this.writeCode(),
      b6: () => this.recordItself(),
    };
    const first = B_BEATS.indexOf(from);
    const last = B_BEATS.indexOf(through);
    this.prime(first);
    for (let i = first; i <= last; i++) {
      if (i > first) await wait(this.stage, 0.25);
      await beats[B_BEATS[i]]();
    }
  }

  /** Put the stage where it stands once the first `done` beats have played, without playing them. */
  private prime(done: number): void {
    if (done < 1) return;
    this.ticket.position.copy(B_LAYOUT.nodes.jira).add(TICKET_BESIDE);
    this.ticket.visible = true;
    if (done < 3) return;
    B_CONTEXT.forEach(({ product }, i) => {
      const p = new Product(product);
      p.rotation.y -= this.drone.rotation.y;
      p.position.set(0, STACK_FROM + i * STACK_STEP, 0);
      p.scale.setScalar(CARRY_SCALE);
      this.drone.rig.hover.add(p);
      this.carried.push(p);
    });
  }

  /** B1: DEMO-990 lands in Jira, beside the Jira node, and pings D3V1N at home: it's assigned. */
  private async ticketLands(): Promise<void> {
    await dropTicket(this.stage, this.ticket, this.node('jira').position.clone().add(TICKET_BESIDE));
    await handOff(this.stage, this.ticket, this.drone);
  }

  /**
   * B2: D3V1N flies into the secured gateway (it flashes green as D3V1N
   * enters: access granted) and through to the Atlassian side, where Rovo
   * waits. It asks once: one packet, D3V1N to Rovo.
   */
  private async askRovo(): Promise<void> {
    const { stage, drone, gateway } = this;
    const [near, far] = gateway.ends;
    drone.status = 'working';
    await hop(stage, drone, near);
    // Out the far side, just clear of the tunnel, where Rovo can hear it.
    await hop(stage, drone, far.clone().add(EXIT_CLEAR));
    drone.status = 'waiting';
    await beam(stage, drone.rig.hover, this.rovo.drone.rig.hover);
    this.rovo.drone.flash = 1;
    this.rovo.drone.status = 'working';
  }

  /**
   * B3: Rovo walks the graph along lines already connected: from the Jira
   * issue to the Confluence PRD to the Figma design, and to Code search for
   * related issues and existing code; each tool lights as the walk reaches
   * it. Everything comes back to Rovo, and Rovo hands it all to D3V1N at
   * once: five on its stack. D3V1N flies back through the gateway and home.
   */
  private async connectedContext(): Promise<void> {
    const { stage, drone } = this;
    const rovo = this.rovo.drone;
    // The walk: out from Rovo to Jira, then along the graph both ways at once.
    await shoot(stage, new LineCurve3(B_LAYOUT.rovo.clone(), B_LAYOUT.nodes.jira.clone()), 7);
    this.reach('jira');
    await Promise.all([
      (async () => {
        await shoot(stage, this.edge('jira', 'confluence').path, 7);
        this.reach('confluence');
        await shoot(stage, this.edge('confluence', 'figma').path, 7);
        this.reach('figma');
      })(),
      (async () => {
        await shoot(stage, this.edge('jira', 'codesearch').path, 7);
        this.reach('codesearch');
      })(),
    ]);
    // Everything gathers at Rovo, all at once.
    const gathered = B_CONTEXT.map(({ from, product }) => {
      const p = new Product(product);
      p.scale.setScalar(CARRY_SCALE);
      stage.add(p);
      return { p, start: this.node(from).emblem.getWorldPosition(new Vector3()) };
    });
    const atRovo = rovo.rig.hover.getWorldPosition(new Vector3()).add(new Vector3(0, 0.9, 0));
    await tween(stage, 0.7, (t) => {
      const e = t * t * (3 - 2 * t);
      for (const { p, start } of gathered) p.position.lerpVectors(start, atRovo, e);
    });
    rovo.flash = 1;
    // One delivery: the five go to D3V1N together and stack up.
    const slots = gathered.map((_, i) => new Vector3(0, STACK_FROM + i * STACK_STEP, 0));
    const from = gathered.map(({ p }) => drone.rig.hover.worldToLocal(p.position.clone()));
    for (const { p } of gathered) {
      p.rotation.y -= drone.rotation.y;
      drone.rig.hover.add(p);
      this.carried.push(p);
    }
    await tween(stage, 0.7, (t) => {
      const e = t * t * (3 - 2 * t);
      gathered.forEach(({ p }, i) => p.position.lerpVectors(from[i], slots[i], e));
    });
    drone.flash = 1;
    for (const kind of this.walked) this.node(kind).light = 'off';
    rovo.status = 'waiting';
    // Back through the gateway, carrying it all, and home.
    drone.status = 'working';
    await hop(stage, drone, this.gateway.ends[0]);
    await hop(stage, drone, B_LAYOUT.home);
    drone.status = 'waiting';
  }

  /** B4: the plan. Home, D3V1N's five merge into one bigger block, the same merge as Version A. */
  private async makePlan(): Promise<void> {
    this.drone.status = 'waiting';
    await mergeIntoPlan(this.stage, this.drone, this.carried, this.plan);
  }

  /**
   * B5: through the gateway, a branch grows off Bitbucket. D3V1N stays home:
   * its commits ride out through the tunnel (it flashes green) and along the
   * graph to Bitbucket, and land on the branch one after another. Then the
   * pull request opens at the branch's end, carrying DEMO-990.
   */
  private async writeCode(): Promise<void> {
    const { stage, drone, branch } = this;
    drone.status = 'working';
    const route = this.commitRoute();
    const toBitbucket = route.getLength();
    await Promise.all(
      COMMITS_AT.map(async (at, i) => {
        await wait(stage, i * 0.3);
        drone.flash = 1;
        this.gateway.grant();
        await shoot(stage, route, Math.max(9, toBitbucket / 1.1), undefined, 'github');
        branch.drawn = Math.max(branch.drawn, at + 0.05);
        this.land(at);
      }),
    );
    branch.drawn = 1;
    drone.status = 'waiting';
    await dropTicket(stage, this.pr, branch.curve.getPointAt(1).add(new Vector3(0, 0, 0.6)));
    this.pr.glow = 1;
  }

  /**
   * B6: Jira records it on its own. A Graph Line draws from the PR back to
   * DEMO-990, and the issue picks up the branch, the commits and the PR (they
   * show under its card). D3V1N stays home: nobody updates it by hand.
   */
  private async recordItself(): Promise<void> {
    const { stage, ticket, record, recordLine } = this;
    await tween(stage, 0.9, (t) => (recordLine.drawn = t * t * (3 - 2 * t)));
    ticket.glow = 1;
    record.visible = true;
    await tween(stage, 0.35, (t) => record.scale.setScalar(Math.max(0.001, t)));
  }

  /** A commit's way out: home, through the tunnel, and along the graph (Jira, Code search) to Bitbucket. */
  private commitRoute(): CurvePath<Vector3> {
    const [near, far] = this.gateway.ends;
    const route = new CurvePath<Vector3>();
    route.add(new LineCurve3(B_LAYOUT.home.clone(), near.clone()));
    route.add(new LineCurve3(near.clone(), far.clone()));
    route.add(this.edge('gateway', 'jira').path);
    route.add(new LineCurve3(this.edge('gateway', 'jira').path.getPointAt(1), this.edge('jira', 'codesearch').path.getPointAt(0)));
    route.add(this.edge('jira', 'codesearch').path);
    route.add(new LineCurve3(this.edge('jira', 'codesearch').path.getPointAt(1), this.edge('codesearch', 'bitbucket').path.getPointAt(0)));
    route.add(this.edge('codesearch', 'bitbucket').path);
    return route;
  }

  /** A commit lands on the branch at `at` (0–1 along it). */
  private land(at: number): void {
    const commit = new Product('github');
    commit.scale.setScalar(1.6);
    commit.position.copy(this.branch.curve.getPointAt(at)).setY(0.2);
    this.stage.add(commit);
    this.commits.push(commit);
  }

  /** From the PR, back along open floor to DEMO-990: along the grid, round one corner. */
  private recordPath(): Curve<Vector3> {
    const bitbucket = B_LAYOUT.nodes.bitbucket;
    const prAt = bitbucket.clone().add(new Vector3(-NODE_FOOTPRINT / 2 - BRANCH_LENGTH, 0, 0.6));
    const ticketAt = B_LAYOUT.nodes.jira.clone().add(TICKET_BESIDE);
    const corner = new Vector3(ticketAt.x, 0, prAt.z);
    return roundedPath([prAt, corner, ticketAt], BEND_RADIUS);
  }

  /** The walk reaches a tool: it lights up. */
  private reach(kind: SystemKind): void {
    this.walked.push(kind);
    this.node(kind).light = 'working';
  }

  edge(from: SystemKind | 'gateway', to: SystemKind): GraphEdge {
    const line = this.lines.find((l) => l.from === from && l.to === to);
    if (!line) throw new Error(`OneTicketB: no line ${from} → ${to}`);
    return line.edge;
  }

  /** A Graph Line between two pads (or the tunnel's far end and a pad): straight along the grid, edge to edge. */
  private linkPath(from: SystemKind | 'gateway', to: SystemKind): Curve<Vector3> {
    const a = from === 'gateway' ? this.gateway.ends[1] : B_LAYOUT.nodes[from];
    const b = B_LAYOUT.nodes[to];
    const dir = b.clone().sub(a).normalize();
    const start = from === 'gateway' ? a.clone() : a.clone().addScaledVector(dir, NODE_FOOTPRINT / 2);
    return new LineCurve3(start, b.clone().addScaledVector(dir, -NODE_FOOTPRINT / 2));
  }

  /** The moment D3V1N enters the tunnel, the gateway flashes green: access granted. */
  private inTunnel = false;
  private watchTunnel(): void {
    const { x, z } = this.drone.position;
    const run = B_GATEWAY;
    const inside = x > run.from - 0.05 && x < run.to + 0.05 && z > run.low - 0.05 && z < run.high + 0.05;
    if (inside && !this.inTunnel) {
      this.crossings++;
      this.gateway.grant();
      this.drone.flash = 1;
    }
    this.inTunnel = inside;
  }

  /** Clear the stage back to before the ticket landed. */
  async reset(): Promise<void> {
    const { stage, ticket, drone } = this;
    await tween(stage, 0.6, (t) => {
      ticket.opacity = Math.min(ticket.opacity, 1 - t);
      for (const p of this.carried) p.scale.setScalar(CARRY_SCALE * Math.max(0.001, 1 - t));
    });
    const { plan, pr, branch, recordLine, record } = this;
    const planScale = plan.scale.x;
    await tween(stage, 0.5, (t) => {
      pr.opacity = Math.min(pr.opacity, 1 - t);
      branch.material.opacity = Math.min(branch.material.opacity, 0.8 * (1 - t));
      recordLine.material.opacity = Math.min(recordLine.material.opacity, 0.85 * (1 - t));
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
    recordLine.drawn = 0;
    recordLine.material.opacity = 0.85;
    record.visible = false;
    ticket.visible = false;
    ticket.opacity = 1;
    for (const node of this.nodes.values()) node.light = 'off';
    this.walked.length = 0;
    this.crossings = 0;
    drone.position.copy(B_LAYOUT.home);
    drone.status = 'waiting';
    this.rovo.drone.status = 'waiting';
    this.d3v1n.animator.restart();
    this.rovo.animator.restart();
  }
}

/**
 * What an issue shows it has picked up, in a row under its card: a short
 * dotted branch, a commit, and the pull request (that system's product).
 */
function recordChips(): Group {
  const row = new Group();
  const face = new Group();
  face.rotation.y = Math.PI / 4;
  row.add(face);
  const branch = new Branch(new LineCurve3(new Vector3(-0.2, 0, 0), new Vector3(0.2, 0, 0)), NEUTRAL.packet);
  branch.drawn = 1;
  branch.rotation.x = Math.PI / 2;
  branch.position.x = -0.42;
  const commit = new Product('github');
  commit.rotation.y = 0;
  commit.position.x = 0;
  const pr = new Product('bitbucket');
  pr.rotation.y = 0;
  pr.position.x = 0.4;
  for (const chip of [commit, pr]) chip.scale.setScalar(1.4);
  face.add(branch, commit, pr);
  // Just under the card.
  face.position.y = -0.62;
  return row;
}
