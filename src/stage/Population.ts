import type { Object3D } from 'three';
import { ConnectionReveal } from '../animation/ConnectionReveal';
import { LINEAGES, type Lineage, type Status } from '../core/palette';
import { Connection } from '../primitives/connection/Connection';
import type { DroneOptions } from '../primitives/drone/Drone';
import type { Packet } from '../primitives/packet/Packet';
import { type SentPacket, sendPacket } from './sendPacket';
import { type SpawnedAgent, type SpawnOptions, spawnAgent } from './spawnAgent';
import type { DetailHost, SceneHost } from './Stage';

/**
 * How Population creates agents and sends packets. The defaults build real
 * drones and packet flights; tests substitute lightweight fakes so the lineage
 * logic runs without WebGL or the DOM.
 */
export interface PopulationDeps {
  spawnAgent: (stage: SceneHost, x: number, z: number, options: SpawnOptions) => SpawnedAgent;
  sendPacket: (stage: SceneHost, from: SpawnedAgent, to: SpawnedAgent) => SentPacket;
}

const DEFAULT_DEPS: PopulationDeps = { spawnAgent, sendPacket };

interface LiveConnection {
  parent: SpawnedAgent;
  child: SpawnedAgent;
  connection: Connection;
  reveal: ConnectionReveal;
}

interface InFlight {
  from: SpawnedAgent;
  to: SpawnedAgent;
  cancel: () => void;
}

/**
 * The agents on a stage and how they relate: parent → sub-agent lineage trees,
 * packets in flight and who sent them, and the Detail view that isolates one
 * lineage with its connections.
 *
 * Packets are never random; they follow status changes:
 * - → Working: hand off to a sub-agent; with none, to the parent or a sibling.
 * - → Stopped: escalate to the parent. Root agents have no one to escalate to.
 * Packets stay inside a lineage, so a standalone agent (no parent, no
 * sub-agents) is silent by design (ILI-874).
 *
 * Dotted lines (task tethers, packet trails, connections) only appear in
 * Detail, and only for the focused lineage. Runtime shows no lines.
 */
export class Population {
  readonly agents: SpawnedAgent[] = [];
  private readonly parents = new Map<SpawnedAgent, SpawnedAgent>();
  private readonly inFlight = new Map<Packet, InFlight>();
  private connections: LiveConnection[] = [];
  private focused: SpawnedAgent | undefined;
  private readonly lastStatus = new Map<SpawnedAgent, Status>();

  private readonly deps: PopulationDeps;

  constructor(private readonly stage: DetailHost, deps: Partial<PopulationDeps> = {}) {
    this.deps = { ...DEFAULT_DEPS, ...deps };
    stage.onTick((dt) => this.tick(dt));
  }

  /**
   * Add an agent at (x, z). With a parent it becomes a sub-agent in the
   * parent's lineage and emerges from the parent drone; a new root gets the
   * least-used lineage color and descends into place. If the family is in
   * Detail, the parent → child connection draws out with the emerging child.
   */
  spawn(x: number, z: number, options: DroneOptions & { parent?: SpawnedAgent } = {}): SpawnedAgent {
    const { parent, ...droneOptions } = options;
    const lineage = parent?.drone.lineage ?? droneOptions.lineage ?? this.freshLineage();
    const agent = this.deps.spawnAgent(this.stage, x, z, {
      ...droneOptions,
      lineage,
      subAgent: Boolean(parent),
      arrival: parent ? { kind: 'emerge', from: parent.drone.rig.hover } : { kind: 'descend' },
    });
    agent.task.rig.tether.visible = false; // revealed by tick() if its lineage is focused
    if (parent) this.parents.set(agent, parent);
    this.agents.push(agent);
    this.lastStatus.set(agent, agent.drone.status);
    if (this.focused && parent && this.family(this.focused).includes(agent)) this.connect(parent, agent);
    return agent;
  }

  /**
   * Remove an agent and its whole subtree (ILI-875: sub-agents exist to serve
   * their parent, so they go with it). Packets to or from removed agents are
   * cancelled. If the focused family survives, Detail stays on it and only the
   * removed connections retract.
   */
  despawn(agent: SpawnedAgent): void {
    const removed = this.subtree(agent);
    const gone = new Set(removed);
    if (this.focused && gone.has(this.focused)) this.focus(undefined);
    for (const live of this.connections) {
      if (gone.has(live.parent) || gone.has(live.child)) live.reveal.shown = false;
    }
    for (const [packet, flight] of this.inFlight) {
      if (!gone.has(flight.from) && !gone.has(flight.to)) continue;
      flight.cancel();
      this.inFlight.delete(packet);
    }
    for (const member of removed.reverse()) {
      this.agents.splice(this.agents.indexOf(member), 1);
      this.parents.delete(member);
      this.lastStatus.delete(member);
      member.despawn();
    }
  }

  clear(): void {
    this.focus(undefined);
    for (const agent of [...this.agents]) this.despawn(agent);
  }

  parentOf(agent: SpawnedAgent): SpawnedAgent | undefined {
    return this.parents.get(agent);
  }

  childrenOf(agent: SpawnedAgent): SpawnedAgent[] {
    return this.agents.filter((a) => this.parents.get(a) === agent);
  }

  /** The whole lineage tree `agent` belongs to: its root ancestor and every descendant. */
  family(agent: SpawnedAgent): SpawnedAgent[] {
    let root = agent;
    for (let p = this.parents.get(root); p; p = this.parents.get(root)) root = p;
    return this.subtree(root);
  }

  /** `agent` and all of its descendants, parents before children. */
  subtree(agent: SpawnedAgent): SpawnedAgent[] {
    const members: SpawnedAgent[] = [];
    const walk = (a: SpawnedAgent) => {
      members.push(a);
      this.childrenOf(a).forEach(walk);
    };
    walk(agent);
    return members;
  }

  send(from: SpawnedAgent, to: SpawnedAgent): void {
    const { packet, landed, cancel } = this.deps.sendPacket(this.stage, from, to);
    packet.trail.visible = false; // revealed by tick() if its lineage is focused
    this.inFlight.set(packet, { from, to, cancel });
    void landed.then(() => this.inFlight.delete(packet));
  }

  get focusedAgent(): SpawnedAgent | undefined {
    return this.focused;
  }

  /**
   * Detail view for `agent`'s lineage: the family and the packets it sends stay
   * at full opacity, parent → child connections draw in, everything else
   * fades. `undefined` returns to Runtime.
   */
  focus(agent: SpawnedAgent | undefined): void {
    this.focused = agent;
    for (const live of this.connections) live.reveal.shown = false;
    if (!agent) {
      this.stage.setDetail(null);
      return;
    }
    for (const child of this.family(agent)) {
      const parent = this.parents.get(child);
      if (parent) this.connect(parent, child);
    }
    // Membership is re-read every frame so new sub-agents and packets join the view.
    this.stage.setDetail(() => {
      const family = new Set(this.family(agent));
      const members: Object3D[] = [...family].map((a) => a.unit);
      for (const [packet, { from }] of this.inFlight) if (family.has(from)) members.push(packet);
      for (const { connection, reveal } of this.connections) if (reveal.shown) members.push(connection);
      return members;
    });
  }

  private connect(parent: SpawnedAgent, child: SpawnedAgent): void {
    const connection = new Connection(child.drone.lineage);
    this.stage.add(connection);
    this.connections.push({
      parent,
      child,
      connection,
      reveal: new ConnectionReveal(connection, parent.drone.rig.hover, child.drone.rig.hover),
    });
  }

  private reactToStatus(agent: SpawnedAgent, status: Status): void {
    const parent = this.parents.get(agent);
    if (status === 'stopped') {
      if (parent) this.send(agent, parent);
      return;
    }
    if (status === 'working') {
      const siblings = parent ? this.childrenOf(parent).filter((a) => a !== agent) : [];
      const children = this.childrenOf(agent);
      const pool = children.length > 0 ? children : parent ? [parent, ...siblings] : [];
      if (pool.length > 0) this.send(agent, pool[Math.floor(Math.random() * pool.length)]);
    }
  }

  private tick(dt: number): void {
    for (const agent of this.agents) {
      const status = agent.drone.status;
      if (this.lastStatus.get(agent) === status) continue;
      this.lastStatus.set(agent, status);
      this.reactToStatus(agent, status);
    }

    const family = new Set(this.focused ? this.family(this.focused) : []);
    for (const agent of this.agents) agent.task.rig.tether.visible = family.has(agent);
    for (const [packet, { from }] of this.inFlight) packet.trail.visible = family.has(from);

    for (const live of this.connections) live.reveal.update(dt);
    this.connections = this.connections.filter((live) => {
      if (!live.reveal.gone) return true;
      live.connection.dispose();
      return false;
    });
  }

  private freshLineage(): Lineage {
    const roots = this.agents.filter((a) => !this.parents.has(a));
    const uses = (l: Lineage) => roots.filter((a) => a.drone.lineage === l).length;
    const least = Math.min(...LINEAGES.map(uses));
    const candidates = LINEAGES.filter((l) => uses(l) === least);
    return candidates[Math.floor(Math.random() * candidates.length)];
  }
}
