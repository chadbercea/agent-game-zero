import { type Curve, LineCurve3, Vector3 } from 'three';
import { NODE_FOOTPRINT } from '../core/grid';
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
import { CARRY_SCALE, hop, STACK_FROM, STACK_STEP, TICKET_SCALE } from './oneTicket';
import { dropTicket, handOff } from './request';
import { tween, wait } from './timeline';

/** Version B's beats, in order. */
export const B_BEATS = ['b1', 'b2', 'b3'] as const;
export type BBeat = (typeof B_BEATS)[number];

/** The same work as Version A, as a Jira issue assigned to D3V1N. */
export const DEMO_990 = { key: 'DEMO-990', title: 'Add dark mode' };

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
    stage.add(this.gateway, this.ticket);
    stage.onTick((dt) => {
      this.gateway.update(dt);
      this.ticket.update(dt);
      for (const { edge } of this.lines) edge.update(dt);
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

  /** Play the beats in order through `through`. */
  async play(through: BBeat = B_BEATS[B_BEATS.length - 1]): Promise<void> {
    const beats: Record<BBeat, () => Promise<void>> = {
      b1: () => this.ticketLands(),
      b2: () => this.askRovo(),
      b3: () => this.connectedContext(),
    };
    const last = B_BEATS.indexOf(through);
    for (let i = 0; i <= last; i++) {
      if (i > 0) await wait(this.stage, 0.3);
      await beats[B_BEATS[i]]();
    }
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
    for (const p of this.carried.splice(0)) p.dispose();
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

