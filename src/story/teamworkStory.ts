import { Vector3 } from 'three';
import { DroneFlight } from '../animation/DroneFlight';
import { hashSeed } from '../core/scatter';
import { Deliverable } from '../primitives/deliverable/Deliverable';
import type { Drone } from '../primitives/drone/Drone';
import { Gateway } from '../primitives/gateway/Gateway';
import type { SystemNode } from '../primitives/node/SystemNode';
import { attachSignal } from '../stage/attachSignal';
import { FACE_CAMERA, type SpawnedDrone, spawnDrone } from '../stage/spawnDrone';
import type { SceneHost } from '../stage/Stage';
import { accessCheck } from './accessCheck';
import { act2, converge, crossGateway, goHome, graphTraffic, securityGateway, visitSpot } from './act2';
import { type CrewMember, dismiss } from './fanOut';
import { GATEWAY, HOME, ROVO_HOME, SECURITY_HOME } from './layout';
import { leaveBase } from './leaveBase';
import { assignRoles, type Role } from './roles';
import { TEAMWORK_LINKS } from './systemLayout';
import type { TeamworkGraph } from './TeamworkGraph';
import { fly, tween, wait } from './timeline';
import { act1, teamworkGraph, type TwoActScene, type WorkingCrew } from './twoActs';

export type StoryStep =
  | 'access'
  | 'denied'
  | 'mapping'
  | 'fan-out'
  | 'working'
  | 'rovo'
  | 'access-2'
  | 'mapping-2'
  | 'fan-out-2'
  | 'security'
  | 'graph'
  | 'connected'
  | 'converge'
  | 'shipped'
  | 'home'
  | 'done';

export const STORY_CAPTION: Record<StoryStep, string> = {
  access: 'Checking access…',
  denied: 'Access denied. The system isn’t working as expected.',
  mapping: 'Access granted. Mapping the system…',
  'fan-out': 'Spawning sub-agents…',
  working: 'Act 1 · 3 agents, 3 isolated jobs',
  rovo: 'Rovo arrives to work the Atlassian side…',
  'access-2': 'Rovo checking access to Atlassian…',
  'mapping-2': 'Access granted. Mapping Atlassian…',
  'fan-out-2': 'Rovo spawning sub-agents…',
  security: 'Security bot sets up a secure gateway between the systems',
  graph: 'The Teamwork Graph connects every system on the grid',
  connected: 'Act 2 · Teamwork Graph: agents cross securely, one connected system',
  converge: 'Converging on one result…',
  shipped: 'Shipped.',
  home: 'Sub-agents heading home…',
  done: 'Done.',
};

/** How long Act 1 runs on its own before Rovo arrives. */
export const ACT1_HOLD = 4;
/** How long the connected system runs (handoffs, crossings, comings and goings) before converging. */
export const CONNECTED_SECONDS = 14;
/** How long the shipped deliverable holds before everyone heads home. */
const SHIPPED_HOLD = 2.5;
/** The deliverable floats beside D3V1N: to its right on screen, about body height. */
const DELIVERABLE_OFFSET = new Vector3(Math.cos(FACE_CAMERA), 0, -Math.sin(FACE_CAMERA)).multiplyScalar(1.6).setY(1.6);
/** When travelers set off and despawners leave during the connected phase (seconds in, then apart). */
const TRAVEL_START = 1;
const TRAVEL_APART = 1.6;
const DESPAWN_START = 3;
const DESPAWN_APART = 2.2;

/** A sub-agent this run, its parent, its role, and (for travelers) where it's visiting. */
interface Cast {
  member: CrewMember;
  parent: Drone;
  role: Role;
  stopLoop: () => void;
  visiting?: SystemNode;
  gone?: boolean;
}

/**
 * The whole story, start to finish, on one grid:
 * Act 1: D3V1N gets access → map → three sub-agents, three isolated jobs.
 * Act 2: Rovo arrives and gets access to Atlassian → map → four sub-agents →
 * a security bot builds the secure gateway (glass tunnel, lock) → the
 * Teamwork Graph draws in between every node → work changes hands along the
 * graph; some sub-agents stay, some finish and go home, some cross to the
 * other system through the gateway (access granted, green, as they pass).
 * Converge: every product flows across the graph into one shipped
 * deliverable at D3V1N; everyone comes home; the graph fades.
 *
 * `play()` runs from wherever the story stands: from the top, or (after a
 * denial) a retry at the gate that said no. `reset()` puts the scene back.
 */
export class TeamworkStory {
  readonly graph: TeamworkGraph;
  readonly gateway = new Gateway(GATEWAY);
  readonly deliverable = new Deliverable();
  private act1Crew: WorkingCrew | null = null;
  private act2Crew: WorkingCrew | null = null;
  private rovo: SpawnedDrone | null = null;
  private cast: Cast[] = [];
  private runs = 0;

  constructor(
    private readonly stage: SceneHost,
    readonly scene: TwoActScene,
    private readonly onStep: (step: StoryStep) => void = () => {},
  ) {
    this.graph = teamworkGraph(stage, scene);
    this.deliverable.position.copy(scene.act1.gate.position).add(DELIVERABLE_OFFSET);
    this.deliverable.visible = false;
    stage.add(this.deliverable, this.gateway);
    stage.onTick((dt) => {
      this.deliverable.update(dt);
      this.gateway.update(dt);
    });
  }

  /** Rovo, while it's on the grid. */
  get rovoDrone(): Drone | null {
    return this.rovo?.drone ?? null;
  }

  /** Resolves true when the story completes, false when a gate denies access (the agent waits there, Stopped). */
  async play(): Promise<boolean> {
    const { stage, scene, onStep } = this;

    if (!this.act1Crew) {
      this.act1Crew = await act1(stage, scene, onStep);
      if (!this.act1Crew) {
        onStep('denied');
        return false;
      }
      await wait(stage, ACT1_HOLD);
    }

    if (!this.rovo) {
      onStep('rovo');
      this.rovo = spawnDrone(stage, ROVO_HOME.x, ROVO_HOME.z, {
        name: 'Rovo',
        lineage: 'cyan',
        showLabel: true,
        status: 'waiting',
      });
      scene.act2.signal = attachSignal(stage, this.rovo.drone, scene.act2.gate);
      // Rovo flies in to its gate.
      this.rovo.drone.status = 'working';
      await fly(stage, DroneFlight.to(this.rovo.drone, scene.act2.gate.position));
    }
    const rovo = this.rovo.drone;
    onStep('access-2');
    if (!(await accessCheck(stage, rovo, scene.act2.gate))) {
      onStep('denied');
      return false;
    }
    this.act2Crew = await act2(stage, rovo, scene.act2.map, (step) =>
      onStep(step === 'mapping' ? 'mapping-2' : 'fan-out-2'),
    );

    onStep('security');
    await securityGateway(stage, this.gateway, SECURITY_HOME);
    onStep('graph');
    await this.graph.reveal(stage);
    // Lines connected to the tunnel's ends: now the streams flow inside it.
    await tween(stage, 1, (t) => (this.gateway.conduit.streams = t));

    onStep('connected');
    this.cast = this.castRoles(rovo);
    const allCrew = this.cast.map((c) => c.member);
    const stopTraffic = graphTraffic(stage, this.graph, allCrew, this.runs);
    await Promise.all([wait(stage, CONNECTED_SECONDS), this.playRoles()]);
    stopTraffic();

    onStep('converge');
    for (const c of this.cast) c.stopLoop();
    await wait(stage, 0.6);
    await converge(stage, scene, this.graph, allCrew, this.deliverable);
    onStep('shipped');
    await wait(stage, SHIPPED_HOLD);

    onStep('home');
    await Promise.all([
      this.everyoneHome(),
      (async () => {
        await wait(stage, 1);
        await this.graph.fade(stage, 1.6);
      })(),
      this.putAwayDeliverable(),
    ]);
    await tween(stage, 0.8, (t) => {
      this.gateway.built = 1 - t;
      this.gateway.lockDrop = 1 - t;
    });
    this.gateway.conduit.streams = 0;
    this.act1Crew = this.act2Crew = null;
    this.cast = [];
    scene.drone.status = 'waiting';
    rovo.status = 'waiting';
    this.runs++;
    onStep('done');
    return true;
  }

  /** Back to the opening: crews dismissed, graph, gateway and maps hidden, gates off, D3V1N home, Rovo gone. */
  async reset(): Promise<void> {
    const { stage, scene } = this;
    const out = this.cast.length
      ? this.cast.filter((c) => !c.gone)
      : [...(this.act1Crew?.crew ?? []), ...(this.act2Crew?.crew ?? [])].map((member) => ({ member }));
    for (const crew of [this.act1Crew, this.act2Crew]) crew?.stop();
    dismiss(out.map((c) => c.member));
    this.act1Crew = this.act2Crew = null;
    this.cast = [];
    this.graph.hide();
    this.gateway.built = 0;
    this.gateway.lockDrop = 0;
    this.gateway.conduit.streams = 0;
    this.deliverable.reset();
    this.deliverable.visible = false;
    scene.act1.map.hide();
    scene.act2.map.hide();
    scene.act1.gate.state = scene.act2.gate.state = 'off';
    const leaving: Promise<void>[] = [];
    if (scene.drone.position.distanceTo(HOME) > 1e-3)
      leaving.push(leaveBase(stage, { drone: scene.drone, ...scene.act1 }, HOME));
    const rovo = this.rovo;
    const signal = scene.act2.signal;
    if (rovo && signal) {
      leaving.push(
        (async () => {
          await leaveBase(stage, { drone: rovo.drone, gate: scene.act2.gate, signal }, ROVO_HOME);
          await tween(stage, 0.6, (t) => (rovo.drone.fade = 1 - t));
          signal.detach();
          rovo.despawn();
        })(),
      );
    }
    this.rovo = null;
    scene.act2.signal = null;
    await Promise.all(leaving);
    scene.drone.status = 'waiting';
  }

  /** This run's roles: each sub-agent stays, despawns or travels (to a node it's linked to in the other system). */
  private castRoles(rovo: Drone): Cast[] {
    const { scene } = this;
    const members = [
      ...this.act1Crew!.crew.map((member, i) => ({
        member,
        parent: scene.drone,
        stopLoop: this.act1Crew!.stopEach[i],
      })),
      ...this.act2Crew!.crew.map((member, i) => ({ member, parent: rovo, stopLoop: this.act2Crew!.stopEach[i] })),
    ];
    const otherSide = (node: SystemNode) =>
      (scene.act1.map.nodes.includes(node) ? scene.act2.map.nodes : scene.act1.map.nodes).filter((other) =>
        TEAMWORK_LINKS.some(
          (l) => (l.a === node.kind && l.b === other.kind) || (l.b === node.kind && l.a === other.kind),
        ),
      );
    const roles = assignRoles(
      members.map(({ member }) => otherSide(member.node).length > 0),
      hashSeed('roles') + this.runs,
    );
    const visited = new Set<SystemNode>();
    return members.map(({ member, parent, stopLoop }, i) => {
      let once = false;
      const stop = () => {
        if (once) return;
        once = true;
        stopLoop();
      };
      const cast: Cast = { member, parent, role: roles[i], stopLoop: stop };
      if (cast.role === 'travel') {
        const free = otherSide(member.node).filter((n) => !visited.has(n));
        cast.visiting = free[0] ?? otherSide(member.node)[0];
        visited.add(cast.visiting);
      }
      return cast;
    });
  }

  /** The connected phase's comings and goings: travelers cross through the gateway, despawners head home. */
  private async playRoles(): Promise<void> {
    const { stage, gateway } = this;
    const travelers = this.cast.filter((c) => c.role === 'travel');
    const despawners = this.cast.filter((c) => c.role === 'despawn');
    await Promise.all([
      ...travelers.map(async (c, k) => {
        await wait(stage, TRAVEL_START + k * TRAVEL_APART);
        await crossGateway(stage, c.member.sub.drone, gateway, visitSpot(c.visiting!));
        c.member.sub.drone.status = 'working';
        c.member.sub.drone.flash = 1;
      }),
      ...despawners.map(async (c, k) => {
        await wait(stage, DESPAWN_START + k * DESPAWN_APART);
        c.stopLoop();
        c.gone = true;
        await goHome(stage, c.member, c.parent);
      }),
    ]);
  }

  /** Everyone still out comes home empty-handed; travelers cross back through the gateway first. */
  private async everyoneHome(): Promise<void> {
    const { stage, gateway } = this;
    await Promise.all(
      this.cast
        .filter((c) => !c.gone)
        .map(async (c, i) => {
          // Travelers leave one at a time so they don't bunch at the tunnel.
          await wait(stage, c.role === 'travel' ? 0.4 + i * 0.9 : i * 0.25);
          if (c.role === 'travel') await crossGateway(stage, c.member.sub.drone, gateway, c.member.node.position);
          c.gone = true;
          await goHome(stage, c.member, c.parent, { carry: false });
        }),
    );
  }

  /** The shipped product rises a little and fades into D3V1N's keeping. */
  private async putAwayDeliverable(): Promise<void> {
    const { stage, deliverable } = this;
    const y = deliverable.position.y;
    deliverable.material.transparent = true;
    await tween(stage, 1.2, (t) => {
      deliverable.position.y = y + t * 0.4;
      deliverable.material.opacity = 1 - t;
    });
    deliverable.visible = false;
    deliverable.reset();
    deliverable.position.y = y;
    deliverable.material.opacity = 1;
    deliverable.material.transparent = false;
  }
}
