import { type Curve, LineCurve3, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Floor, squareAt } from '../core/floor';
import { BEND_RADIUS, FACE_CAMERA, NODE_FOOTPRINT } from '../core/grid';
import { NEUTRAL, type Status } from '../core/palette';
import { BIG_BLOCK } from '../primitives/assembler/Assembler';
import { Branch } from '../primitives/branch/Branch';
import { reversed, roundedPath } from '../primitives/branch/gridPath';
import { Flag } from '../primitives/flag/Flag';
import { SystemNode } from '../primitives/node/SystemNode';
import { Gateway } from '../primitives/gateway/Gateway';
import { TERMINAL_SIZE, Terminal } from '../primitives/terminal/Terminal';
import type { GroundPanelData } from '../primitives/unit/GroundPanel';
import type { FloorRect, PanelDirection } from '../primitives/unit/unitLayout';
import type { SceneHost } from '../stage/Stage';
import { shoot } from './beam';
import type { Incident } from './incident';
import type { ProductionPlace } from './storyMap';
import { tween, wait } from './timeline';
import type { GatewayCardData } from '../stage/inspectCards';
import type { GatewaySide } from '../primitives/unit/unitLayout';
import { borderAt, borderFor, cutToBorders, gatewayPanel, groundNode, groundPanel, type PanelWays } from './units';

const HALF_NODE = NODE_FOOTPRINT / 2 + 0.08;
const HALF_TERMINAL = TERMINAL_SIZE / 2 + 0.06;
/** How fast a release rides out to its service. */
const RELEASE_SPEED = 3.4;
/** How close a replica or terminal may stand to another node, and to a line. */
const NODE_ROOM = 1.4;
/** How far out from its service a replica or terminal may stand, nearest first. */
const BESIDE = [2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6];
/** A feature flag stands a little bigger than its specimen, so it reads at map scale. */
const FLAG_SCALE = 1.3;

/** A line between two services: who calls whom. */
export interface Dependency {
  from: number;
  to: number;
  line: Branch;
  /** Its points along the grid, node center to node center. */
  points: Vector3[];
}

/** A replica grown in beside a service: its line (from the service), its node, and which way its panel lies. */
export interface Replica {
  of: number;
  node: SystemNode;
  line: Branch;
  way: PanelDirection;
}

/**
 * Production (Rovo on Call; docs/rovo-mental-model.md): where the code side's
 * releases go. Past the assembler, a secure glass tunnel crosses into production;
 * past it stands the production server the releases are shipped to, and it
 * serves the rest of the business: a web front, the APIs behind it, the data
 * behind those, each a system node whose light is its health (green healthy,
 * yellow degraded, red down), joined by gray lines along the grid from caller
 * to callee.
 *
 * It comes up line first, node after (`comeUp`): the tunnel, its line to the
 * server, the server, its line to the front, then tier by tier. A release
 * from the assembler goes through the tunnel (it flashes, its lock sways), into
 * the server, and on along the lines to its service (`deliver`). Fixes happen
 * at a service: replicas grow in beside it (line first), or its feature flag lowers.
 */
export class Production {
  /** The secure glass tunnel into production. */
  readonly tunnel: Gateway;
  /** The production server releases are shipped to. */
  readonly server: SystemNode;
  readonly nodes: SystemNode[];
  /** Tunnel → the server, and the server → the front. */
  readonly intoServer: Branch;
  readonly toFront: Branch;
  readonly dependencies: Dependency[] = [];
  readonly replicas: Replica[] = [];
  /** A feature flag on a service, once one is turned off there. */
  flag?: { at: number; flag: Flag };
  /** Releases delivered to a service so far. */
  delivered = 0;
  private readonly untick: () => void;

  constructor(
    private readonly stage: SceneHost,
    readonly place: ProductionPlace,
    readonly incident: Incident,
    /** Which way each node's ground panel lies (the map's: `server`, `tier{k}-{j}`): lines end on their units' borders. */
    private readonly ways: PanelWays = new Map(),
    /** The map's floor: replicas stand only where their units fit. */
    private readonly floor?: Floor,
    /** Which side of the secure gateway its panel lies (the map's). */
    gatewaySide: GatewaySide = 'near-from',
  ) {
    const { flow, tierGap } = place;
    this.tunnel = new Gateway(place.tunnel);
    gatewayPanel(this.tunnel, gatewaySide, () => this.tunnelFacts());
    this.tunnel.visible = false;
    this.server = new SystemNode({ kind: 'server', showLabel: false });
    groundNode(ways, 'server', this.server, 1, () => this.serverFacts());
    this.server.position.copy(place.server);
    this.server.scale.setScalar(0.001);
    this.server.labelOpacity = 0;
    this.server.light = 'working';
    stage.add(this.tunnel, this.server);

    this.nodes = incident.services.map((s, i) => {
      const node = new SystemNode({ kind: s.kind, name: s.name, showLabel: false });
      groundNode(ways, slotId(s), node, 1, () => this.serviceFacts(i, node));
      node.position.copy(place.tiers[s.tier][s.slot]);
      node.scale.setScalar(0.001);
      node.labelOpacity = 0;
      node.light = 'working';
      stage.add(node);
      return node;
    });
    const front = this.nodes[0].position;
    const serverEdge = this.border('server', place.server);
    const frontEdge = this.border(slotId(incident.services[0]), front);
    this.intoServer = new Branch(straight(cutToBorders([place.tunnelOut, place.server], 0, serverEdge)), NEUTRAL.packet);
    this.toFront = new Branch(straight(cutToBorders([place.server, front], serverEdge, frontEdge)), NEUTRAL.packet);
    for (const line of [this.intoServer, this.toFront]) line.drawn = 0;
    stage.add(this.intoServer, this.toFront);

    // Caller → callee, along the grid: out of the caller downstream, across at the halfway line, on into the callee.
    incident.services.forEach((s, from) => {
      for (const to of s.calls) {
        const a = this.nodes[from].position.clone();
        const b = this.nodes[to].position.clone();
        const turnAt = a.clone().addScaledVector(flow, tierGap);
        const corner = b.clone().addScaledVector(flow, -tierGap);
        const points = corner.distanceTo(turnAt) < 1e-6 ? [a, b] : [a, turnAt, corner, b];
        const ends = [this.border(slotId(s), a), this.border(slotId(incident.services[to]), b)] as const;
        const line = new Branch(roundedPath(cutToBorders(points, ...ends), BEND_RADIUS), NEUTRAL.packet);
        line.drawn = 0;
        stage.add(line);
        this.dependencies.push({ from, to, line, points });
      }
    });
    this.untick = stage.onTick((dt) => {
      if (this.tunnel.visible) this.tunnel.update(dt);
    });
  }

  /**
   * Production comes up: the glass tunnel builds and locks; its line draws to
   * the server, which stands up; the server's line draws to the front; then
   * tier by tier, each line and then the service at its end.
   */
  async comeUp(): Promise<void> {
    const { stage, tunnel } = this;
    tunnel.visible = true;
    await tween(stage, 0.5, (t) => (tunnel.built = t));
    await tween(stage, 0.4, (t) => (tunnel.lockDrop = t));
    await tween(stage, 0.5, (t) => (this.intoServer.drawn = t));
    await this.grow(this.server);
    tunnel.conduit.streams = 1;
    await tween(stage, 0.5, (t) => (this.toFront.drawn = t));
    await this.grow(this.nodes[0]);
    for (const tier of [1, 2]) {
      const into = this.dependencies.filter((d) => this.incident.services[d.to].tier === tier);
      await tween(stage, 0.6, (t) => into.forEach((d) => (d.line.drawn = Math.max(d.line.drawn, t))));
      await Promise.all([...new Set(into.map((d) => d.to))].map((i) => this.grow(this.nodes[i])));
    }
  }

  /** A service's health: its light (green healthy, yellow degraded, red down, off out of service). */
  health(i: number, status: Status | 'off'): void {
    this.nodes[i].light = status;
  }

  /** How a request gets from the front to service `i`: the services along the way, front first. */
  pathTo(i: number): number[] {
    const back = new Map<number, number>();
    const queue = [0];
    while (queue.length) {
      const at = queue.shift()!;
      if (at === i) break;
      for (const next of this.incident.services[at].calls) {
        if (back.has(next) || next === 0) continue;
        back.set(next, at);
        queue.push(next);
      }
    }
    const path = [i];
    while (path[0] !== 0) path.unshift(back.get(path[0])!);
    return path;
  }

  /**
   * A release from the assembler (`release`, or a fresh one if none):
   * it goes into the glass tunnel (the tunnel flashes, its lock sways),
   * through it, along the line into the production server, out along its
   * line to the front, and on along the lines to service `i`, and goes in.
   */
  async deliver(i: number, release?: Mesh): Promise<void> {
    const block =
      release ?? new Mesh(new RoundedBoxGeometry(BIG_BLOCK, BIG_BLOCK, BIG_BLOCK, 3, 0.05), new MeshStandardMaterial({ color: NEUTRAL.packet, roughness: 0.4, flatShading: true }));
    block.castShadow = true;
    this.stage.add(block);
    if (!release) block.position.copy(this.place.tunnelIn).setY(BIG_BLOCK / 2 + 0.05);
    const [inEnd, outEnd] = [this.place.tunnelIn, this.place.tunnelOut];
    this.tunnel.grant();
    const path = this.pathTo(i);
    const legs: Curve<Vector3>[] = [new LineCurve3(inEnd.clone(), outEnd.clone()), this.intoServer.curve, this.toFront.curve];
    path.slice(1).forEach((to, k) => legs.push(this.dependency(path[k], to).line.curve));
    const at = new Vector3();
    for (const [n, leg] of legs.entries()) {
      // It passes through the server, and each service on the way, onto the next line.
      if (n > 0 || block.position.distanceTo(inEnd) > 0.05) {
        const from = block.position.clone();
        leg.getPointAt(0, at);
        await tween(this.stage, 0.18, (t) => block.position.lerpVectors(from, at.clone().setY(BIG_BLOCK / 2 + 0.05), t));
      }
      await tween(this.stage, leg.getLength() / RELEASE_SPEED, (t) => {
        leg.getPointAt(t, at);
        block.position.set(at.x, BIG_BLOCK / 2 + 0.05, at.z);
        block.rotation.y = FACE_CAMERA;
      });
    }
    const from = block.position.clone();
    const into = this.nodes[i].position.clone().setY(0.3);
    await tween(this.stage, 0.3, (t) => {
      block.position.lerpVectors(from, into, t);
      block.scale.setScalar(Math.max(0.001, 1 - t));
    });
    block.removeFromParent();
    // A release from the assembler shares its shape with the assembler's; only its material is its own.
    if (!release) block.geometry.dispose();
    (block.material as MeshStandardMaterial).dispose();
    this.delivered++;
  }

  /** Tracing the dependencies of service `i`: a status packet rides each line into it and each line out of it. */
  async trace(i: number): Promise<void> {
    const touching = this.dependencies.filter((d) => d.from === i || d.to === i);
    await Promise.all(
      touching.map(async (d, k) => {
        await wait(this.stage, k * 0.2);
        await shoot(this.stage, d.to === i ? d.line.curve : reversed(d.line.curve), 5);
      }),
    );
  }

  /**
   * Spots beside service `i` with room for a replica to stand (or a
   * terminal): straight out from it along the grid, nearest first, each with
   * a way for its unit that clears the map's floor (and what's grown in since,
   * and each other) with its line from the service.
   */
  spotsBeside(i: number, taken: readonly Vector3[] = []): Vector3[] {
    const at = this.nodes[i].position;
    const floor = this.standingFloor(taken);
    const free: Vector3[] = [];
    const candidates = GRID_DIRS.flatMap((d) => BESIDE.map((r) => ({ spot: at.clone().addScaledVector(d, r), r }))).sort((a, b) => a.r - b.r);
    for (const { spot } of candidates) {
      if ([at, ...taken].some((o) => o.distanceTo(spot) < NODE_ROOM)) continue;
      const unit = { at: spot, size: NODE_FOOTPRINT };
      const way = floor.wayFor(unit, ['x', 'z'], [[at, spot]]);
      if (!way) continue;
      floor.addUnit(unit, way);
      floor.addLine([at.clone(), spot.clone()]);
      free.push(spot);
    }
    return free;
  }

  /** The floor as it stands now: the map's, with every replica and its line on it, and `taken` spots kept clear. */
  private standingFloor(taken: readonly Vector3[] = []): Floor {
    const floor = this.floor?.fork() ?? new Floor();
    for (const r of this.replicas) {
      floor.addUnit({ at: r.node.position, size: NODE_FOOTPRINT }, r.way);
      floor.addLine([this.nodes[r.of].position.clone(), r.node.position.clone()]);
    }
    for (const t of taken) floor.addPart(squareAt(t, TERMINAL_SIZE));
    return floor;
  }

  /** Where lines meet node `id` at `at`: its unit's border, or just short of the node if it has no panel. */
  private border(id: string, at: Vector3): FloorRect | number {
    return borderFor(this.ways, id, at, 1, HALF_NODE);
  }

  /** The secure crossing's card: what it joins, whether it's secured, its traffic, and the releases through it. */
  tunnelFacts(): GatewayCardData {
    return { sides: ['Assembler', 'Production server'], secured: this.tunnel.lockDrop >= 1, flowing: this.tunnel.conduit.streams > 0, crossings: this.delivered };
  }

  /** What the production server's card and panel show. */
  serverFacts(): GroundPanelData {
    return { name: 'Production server', system: 'Production', light: this.server.light, makes: 'Releases, served to the business', linked: [this.incident.services[0].name] };
  }

  /** What service `i`'s card and panel show. */
  serviceFacts(i: number, node = this.nodes[i]): GroundPanelData {
    const s = this.incident.services[i];
    const names = this.incident.services.map((x) => x.name);
    return { name: s.name, system: 'Production service', light: node.light, makes: 'Requests', linked: s.calls.map((c) => names[c]) };
  }

  /** What a replica's card and panel show. */
  replicaFacts(r: { of: number; node: SystemNode }): GroundPanelData {
    const name = this.incident.services[r.of].name;
    return { name: `${name} replica`, system: 'Production service', light: r.node.light, makes: 'Requests', linked: [name] };
  }

  /** A replica of service `i` grows in at `spot`: the line draws out of the service first, then the replica stands up at its end, healthy. */
  async addReplica(i: number, spot: Vector3, name: string): Promise<Replica> {
    const service = this.nodes[i];
    const unit = { at: spot, size: NODE_FOOTPRINT };
    const way = this.standingFloor().wayFor(unit, ['x', 'z'], [[service.position, spot]]) ?? 'x';
    const line = new Branch(
      straight(cutToBorders([service.position, spot], this.border(slotId(this.incident.services[i]), service.position), borderAt(spot, 1, way))),
      NEUTRAL.packet,
    );
    line.drawn = 0;
    this.stage.add(line);
    await tween(this.stage, 0.45, (t) => (line.drawn = t));
    // No name under it: it's one more of the service (its card names it).
    const node = new SystemNode({ kind: service.kind, name, showLabel: false });
    const replica = { of: i, node, line, way };
    groundPanel(node, way, 1, () => this.replicaFacts(replica));
    node.position.copy(spot);
    node.scale.setScalar(0.001);
    node.labelOpacity = 0;
    node.light = 'working';
    this.stage.add(node);
    this.replicas.push(replica);
    await this.grow(node);
    return replica;
  }

  /** A replica that was only for the spike goes: it folds first, then its line draws back into the service. */
  async removeReplica(replica: Replica): Promise<void> {
    const { node, line } = replica;
    await tween(this.stage, 0.35, (t) => {
      node.scale.setScalar(Math.max(0.001, 1 - t));
      node.labelOpacity = 1 - t;
    });
    await tween(this.stage, 0.4, (t) => (line.drawn = Math.max(0.001, 1 - t)));
    this.replicas.splice(this.replicas.indexOf(replica), 1);
    node.dispose();
    line.dispose();
  }

  /** The feature flag at service `i` is turned off: the flag stands up on the service's slab, raised, then lowers. */
  async flagOff(i: number): Promise<void> {
    const flag = new Flag();
    const node = this.nodes[i];
    // On the slab's right-hand corner, clear of the emblem and of a copy hovering over it.
    flag.position.copy(node.position).add(new Vector3(0.34, 0.2, -0.34));
    flag.rotation.y = FACE_CAMERA;
    flag.scale.setScalar(0.001);
    this.stage.add(flag);
    this.flag = { at: i, flag };
    await tween(this.stage, 0.35, (t) => flag.scale.setScalar(Math.max(0.001, FLAG_SCALE * easeOutBack(t))));
    await tween(this.stage, 0.7, (t) => (flag.raised = 1 - t * t));
  }

  /**
   * A terminal tailing service `i`'s logs, built out from a copy at `spot`:
   * the terminal grows in under it, then its line draws into the service.
   * Returns the terminal and how to fold it back (line first, then the terminal).
   */
  async logsTerminal(i: number, spot: Vector3, seed: number): Promise<{ terminal: Terminal; fold: () => Promise<void> }> {
    const { stage } = this;
    const service = this.nodes[i].position;
    const terminal = new Terminal({ state: 'admin', seed });
    terminal.position.copy(spot);
    terminal.scale.setScalar(0.001);
    const line = new Branch(straight(cutToBorders([spot, service], HALF_TERMINAL, this.border(slotId(this.incident.services[i]), service))), NEUTRAL.packet);
    line.drawn = 0;
    stage.add(terminal, line);
    const untick = stage.onTick((dt) => terminal.update(dt));
    await tween(stage, 0.4, (t) => terminal.scale.setScalar(Math.max(0.001, easeOutBack(t))));
    await tween(stage, 0.45, (t) => (line.drawn = t));
    terminal.state = 'tail';
    return {
      terminal,
      fold: async () => {
        await tween(stage, 0.4, (t) => (line.drawn = Math.max(0.001, 1 - t)));
        terminal.state = 'off';
        await tween(stage, 0.35, (t) => terminal.scale.setScalar(Math.max(0.001, 1 - t)));
        untick();
        terminal.dispose();
        line.dispose();
      },
    };
  }

  /** Every node standing in production, for keeping lines and spots clear. */
  positions(): Vector3[] {
    return [this.server.position, ...this.nodes.map((n) => n.position), ...this.replicas.map((r) => r.node.position)];
  }

  dispose(): void {
    this.untick();
    for (const n of this.nodes) n.dispose();
    for (const d of this.dependencies) d.line.dispose();
    for (const r of this.replicas) {
      r.node.dispose();
      r.line.dispose();
    }
    this.flag?.flag.dispose();
    this.intoServer.dispose();
    this.toFront.dispose();
    this.server.dispose();
    this.tunnel.dispose();
  }

  private dependency(from: number, to: number): Dependency {
    const d = this.dependencies.find((x) => x.from === from && x.to === to);
    if (!d) throw new Error(`Production: no line from ${from} to ${to}`);
    return d;
  }

  private async grow(node: SystemNode): Promise<void> {
    await tween(this.stage, 0.4, (t) => {
      node.scale.setScalar(Math.max(0.001, easeOutBack(t)));
      node.labelOpacity = t;
    });
  }
}

/** A service's slot id on the map's floor. */
function slotId(s: { tier: number; slot: number }): string {
  return `tier${s.tier}-${s.slot}`;
}

/** A two-point cut line, straight. */
function straight(line: Vector3[]): LineCurve3 {
  return new LineCurve3(line[0], line[line.length - 1]);
}

const GRID_DIRS = [new Vector3(1, 0, 0), new Vector3(0, 0, 1), new Vector3(-1, 0, 0), new Vector3(0, 0, -1)];

function easeOutBack(t: number): number {
  const c = 1.6;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}
