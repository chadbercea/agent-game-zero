import { type Curve, CurvePath, LineCurve3, Vector3 } from 'three';
import { reversed } from '../primitives/branch/gridPath';
import { DroneFlight } from '../animation/DroneFlight';
import { hashSeed } from '../core/scatter';
import type { Drone } from '../primitives/drone/Drone';
import { Gateway } from '../primitives/gateway/Gateway';
import { Ticket } from '../primitives/ticket/Ticket';
import type { SystemNode } from '../primitives/node/SystemNode';
import { attachSignal } from '../stage/attachSignal';
import { type SpawnedDrone, spawnDrone } from '../stage/spawnDrone';
import type { SceneHost } from '../stage/Stage';
import { accessCheck } from './accessCheck';
import { act2, crossGateway, goHome, graphTraffic, securityGateway, visitSpot } from './act2';
import { type CrewMember, dismiss } from './fanOut';
import { D3V1N_REQUEST, GATEWAY, HOME, REVIEW_SPOT, ROVO_HOME, ROVO_REQUEST, SECURITY_HOME } from './layout';
import { leaveBase } from './leaveBase';
import { DEMO_1 } from './ledger';
import { agentCard, gateCard, type HoverTarget, nodeCard, reviewCard } from './hoverCards';
import { Review } from './review';
import { ATLASSIAN, D3V1N_ID, nodeId, ROVO_ID, subId, TOOLS, Volume, type Worker } from './volume';
import { takeRequest } from './request';
import { SMALL_TICKET, Trickle } from './trickle';
import { assignRoles, type Role } from './roles';
import { TEAMWORK_LINKS } from './systemLayout';
import type { GraphLink, TeamworkGraph } from './TeamworkGraph';
import { fly, tween, wait } from './timeline';
import { act1, teamworkGraph, type TwoActScene, type WorkingCrew } from './twoActs';

export type StoryStep =
  | 'request'
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
  | 'review'
  | 'shipped'
  | 'home'
  | 'done';

export const STORY_CAPTION: Record<StoryStep, string> = {
  request: `A request arrives for D3V1N: ${DEMO_1.key} ${DEMO_1.title}`,
  access: 'Checking access…',
  denied: 'Access denied. The system isn’t working as expected.',
  mapping: 'Access granted. Mapping the system…',
  'fan-out': 'Spawning sub-agents…',
  working: 'Act 1 · 3 agents, 3 isolated jobs',
  rovo: 'Rovo picks up the same request for the Atlassian side…',
  'access-2': 'Rovo checking access to Atlassian…',
  'mapping-2': 'Access granted. Mapping Atlassian…',
  'fan-out-2': 'Rovo spawning sub-agents…',
  security: 'Security bot sets up a secure gateway between the systems',
  graph: 'The Teamwork Graph connects every system on the grid',
  connected: 'Act 2 · Teamwork Graph: agents cross securely, one connected system',
  review: `${DEMO_1.key} goes to review, like every other finished request…`,
  shipped: `${DEMO_1.key} confirmed at review: one change among everything done on the grid today`,
  home: 'Sub-agents heading home…',
  done: 'Done.',
};

/** How long Act 1 runs on its own before Rovo arrives. */
export const ACT1_HOLD = 4;
/** How long the connected system runs (handoffs, crossings, comings and goings) before DEMO-1 ships. */
export const CONNECTED_SECONDS = 14;
/** How long the moment DEMO-1 ships holds before everyone heads home. */
const SHIPPED_HOLD = 2.5;
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
  /** The graph link a traveler rides to its visit (feeder → tunnel → feeder). */
  via?: GraphLink;
  /** Where a traveler is hovering now, if beside the node's own sub-agent rather than over the node. */
  beside?: Vector3;
  gone?: boolean;
}

/**
 * The whole story, start to finish, on one grid. It follows one request,
 * DEMO-1, through a system that's busy with hundreds of others: small
 * tickets trickle into every open system the whole time (see Trickle), and
 * hover cards report everyone's volume of work (see Volume). DEMO-1 is just
 * one small ticket, dropped in front of D3V1N and, later, Rovo.
 * Act 1: D3V1N takes DEMO-1, gets access → map → three sub-agents, three
 * isolated jobs.
 * Act 2: Rovo takes the same request and gets access to Atlassian → map → four sub-agents →
 * a security bot builds the secure gateway (glass tunnel, lock) → the
 * Teamwork Graph draws in between every node → work changes hands along the
 * graph; some sub-agents stay, some finish and go home, some cross to the
 * other system through the gateway (access granted, green, as they pass).
 * DEMO-1 ships, one change among everything done on the grid today;
 * everyone comes home, carrying their work; the graph fades.
 *
 * `play()` runs from wherever the story stands: from the top, or (after a
 * denial) a retry at the gate that said no. `reset()` puts the scene back.
 */
export class TeamworkStory {
  readonly graph: TeamworkGraph;
  readonly gateway = new Gateway(GATEWAY);
  /** DEMO-1's ticket: small and unlabeled like every other request. */
  readonly ticket = new Ticket(undefined, { label: false });
  /** Requests arriving in every open system, one small ticket per request the ledger takes in. */
  readonly trickle: Trickle;
  /** "Is this right?": every request the agents finish goes through it, DEMO-1 included. */
  readonly review: Review;
  /** D3V1N has DEMO-1 (a retry at the first gate doesn't drop it again). */
  private requested = false;
  private act1Crew: WorkingCrew | null = null;
  private act2Crew: WorkingCrew | null = null;
  private rovo: SpawnedDrone | null = null;
  private cast: Cast[] = [];
  private runs = 0;
  /** Volume of work across the grid: what hover cards report. */
  readonly volume: Volume;

  constructor(
    private readonly stage: SceneHost,
    readonly scene: TwoActScene,
    private readonly onStep: (step: StoryStep) => void = () => {},
  ) {
    this.graph = teamworkGraph(stage, scene);
    this.volume = new Volume(stage, scene, () => this.workers(), hashSeed('volume'));
    // The tunnel's data flows only while the graph's feeder lines are connected to its ends.
    this.graph.feed(this.gateway.conduit);
    this.trickle = new Trickle(stage, [scene.act1, scene.act2]);
    this.volume.onArrive((id) => this.trickle.land(id));
    this.review = new Review(stage, REVIEW_SPOT, scene.act1.gate.position, this.volume.ledger, hashSeed('review'));
    this.volume.onFinish(({ item, nodeKind }) => void this.review.submit(item, nodeKind));
    this.ticket.scale.setScalar(SMALL_TICKET);
    this.ticket.visible = false;
    stage.add(this.gateway, this.ticket);
    stage.onTick((dt) => {
      this.ticket.update(dt);
      this.gateway.update(dt);
      // Review belongs to D3V1N's system: there while it's mapped, taking work while its gate is open.
      this.review.visible = scene.act1.map.revealed;
      this.review.open = scene.act1.map.revealed && scene.act1.gate.state === 'open';
    });
  }

  /** Rovo, while it's on the grid. */
  get rovoDrone(): Drone | null {
    return this.rovo?.drone ?? null;
  }

  /** Resolves true when the story completes, false when a gate denies access (the agent waits there, Stopped). */
  async play(): Promise<boolean> {
    const { stage, scene, onStep } = this;

    if (!this.requested) {
      onStep('request');
      await takeRequest(stage, this.ticket, D3V1N_REQUEST, scene.drone);
      this.requested = true;
    }

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
      // The same request lands in front of Rovo.
      await takeRequest(stage, this.ticket, ROVO_REQUEST, this.rovo.drone);
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
    const stopTraffic = graphTraffic(
      stage,
      this.graph,
      this.cast.map((c) => c.member),
      this.runs,
    );
    await Promise.all([wait(stage, CONNECTED_SECONDS), this.playRoles()]);
    stopTraffic();

    for (const c of this.cast) c.stopLoop();
    await wait(stage, 0.6);
    // DEMO-1 is finished: it goes to review like everything else. Confirmed, it's done, and the work goes on.
    onStep('review');
    await this.review.submit(DEMO_1, 'bitbucket', 'confirmed');
    this.volume.ledger.finish(DEMO_1.key);
    scene.drone.flash = 1;
    rovo.flash = 1;
    onStep('shipped');
    await wait(stage, SHIPPED_HOLD);

    onStep('home');
    await Promise.all([
      this.everyoneHome(),
      (async () => {
        await wait(stage, 1);
        await this.graph.fade(stage, 1.6);
      })(),
    ]);
    await tween(stage, 0.8, (t) => {
      this.gateway.built = 1 - t;
      this.gateway.lockDrop = 1 - t;
    });
    this.act1Crew = this.act2Crew = null;
    this.cast = [];
    scene.drone.status = 'waiting';
    rovo.status = 'waiting';
    this.runs++;
    onStep('done');
    return true;
  }

  /** Back to the opening: crews dismissed, graph, gateway and maps hidden, gates off, D3V1N home, Rovo gone, the request cleared. */
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
    this.trickle.clear();
    this.review.reset();
    this.ticket.visible = false;
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
    this.requested = false;
    this.volume.followRequest();
    await Promise.all(leaving);
    scene.drone.status = 'waiting';
  }

  /** Everyone on the grid who can be working right now: both agents and every sub-agent still out. */
  workers(): Worker[] {
    const { scene } = this;
    const out: Worker[] = [{ id: D3V1N_ID, drone: scene.drone }];
    if (this.rovo) out.push({ id: ROVO_ID, drone: this.rovo.drone });
    const member = (m: CrewMember, parentId: string, at = m.node): Worker => ({
      id: subId(m.node.kind),
      drone: m.sub.drone,
      parentId,
      nodeId: nodeId(at.kind),
    });
    if (this.cast.length) {
      for (const c of this.cast) {
        if (c.gone) continue;
        out.push(member(c.member, c.parent === scene.drone ? D3V1N_ID : ROVO_ID, c.visiting ?? c.member.node));
      }
    } else {
      for (const m of this.act1Crew?.crew ?? []) out.push(member(m, D3V1N_ID));
      for (const m of this.act2Crew?.crew ?? []) out.push(member(m, ROVO_ID));
    }
    return out;
  }

  /** What you can hover on the grid and the card each shows: gates, nodes, agents, sub-agents. */
  hoverTargets(): HoverTarget[] {
    const { scene } = this;
    const ledger = this.volume.ledger;
    const workers = this.workers().filter((w) => ledger.has(w.id));
    const name = (id: string) => ledger.entity(id).name;
    const crewOf = (w: Worker): string[] =>
      w.parentId
        ? [name(w.parentId), ...(w.nodeId ? [name(w.nodeId)] : [])]
        : workers.filter((o) => o.parentId === w.id).map((o) => name(o.id));
    return [
      { object: scene.act1.gate, card: () => gateCard(ledger, TOOLS) },
      { object: scene.act2.gate, card: () => gateCard(ledger, ATLASSIAN) },
      { object: this.review.gate, card: () => reviewCard(this.review.summary(), this.review.waiting) },
      ...[...scene.act1.map.nodes, ...scene.act2.map.nodes].map((node) => ({
        object: node,
        card: () => nodeCard(ledger, nodeId(node.kind), node.kind),
      })),
      ...workers.map((w) => ({ object: w.drone, card: () => agentCard(ledger, w.id, crewOf(w)) })),
    ];
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
        cast.via = this.graph.links.find(
          (l) =>
            (l.from === member.node && l.to === cast.visiting) || (l.to === member.node && l.from === cast.visiting),
        );
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
        // Ride the link out: its feeder, through the tunnel, the partner's feeder. Hover over the
        // node, or beside its own sub-agent if that one's still there working.
        const resident = this.cast.find((o) => o.member.node === c.visiting && !o.gone && o.role !== 'travel');
        const path = new CurvePath<Vector3>();
        path.add(this.rideOut(c));
        if (resident) {
          c.beside = visitSpot(c.visiting!);
          path.add(new LineCurve3(c.visiting!.position.clone(), c.beside.clone()));
        }
        await crossGateway(stage, c.member.sub.drone, gateway, path);
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

  /** Everyone still out comes home with its work; travelers cross back through the gateway first. */
  private async everyoneHome(): Promise<void> {
    const { stage, gateway } = this;
    await Promise.all(
      this.cast
        .filter((c) => !c.gone)
        .map(async (c, i) => {
          // Travelers leave one at a time so they don't bunch at the tunnel.
          await wait(stage, c.role === 'travel' ? 0.4 + i * 0.9 : i * 0.25);
          if (c.role === 'travel') {
            // Back the way it came: off to the node, the partner's feeder, the tunnel, its own feeder.
            const path = new CurvePath<Vector3>();
            if (c.beside) path.add(new LineCurve3(c.beside.clone(), c.visiting!.position.clone()));
            path.add(reversed(this.rideOut(c)));
            await crossGateway(stage, c.member.sub.drone, gateway, path);
          }
          c.gone = true;
          await goHome(stage, c.member, c.parent);
        }),
    );
  }

  /** A traveler's way out: its link's route from its own node to the node it visits. */
  private rideOut(c: Cast): Curve<Vector3> {
    const link = c.via!;
    return link.from === c.member.node ? link.route : reversed(link.route);
  }
}
