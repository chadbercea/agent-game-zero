import { type Curve, CurvePath, LineCurve3, MathUtils, Vector3 } from 'three';
import { DroneFlight } from '../animation/DroneFlight';
import { BEND_RADIUS, NODE_FOOTPRINT } from '../core/grid';
import { inRun } from '../core/sharedRuns';
import { reversed, roundedPath, trimPolyline } from '../primitives/branch/gridPath';
import { Charge } from '../primitives/charge/Charge';
import { Cloud } from '../primitives/cloud/Cloud';
import { Drone, SUB_AGENT_SCALE } from '../primitives/drone/Drone';
import { Gateway } from '../primitives/gateway/Gateway';
import { GRAPH_COLOR } from '../primitives/graph/GraphEdge';
import { Job } from '../primitives/job/Job';
import type { SystemKind } from '../primitives/node/emblems';
import { EMBLEM_SCALE, type SystemNode } from '../primitives/node/SystemNode';
import { Ticket } from '../primitives/ticket/Ticket';
import { attachSignal } from '../stage/attachSignal';
import { FACE_CAMERA, type SpawnedDrone } from '../stage/spawnDrone';
import type { SceneHost, Stage } from '../stage/Stage';
import { accessCheck } from './accessCheck';
import { shoot } from './beam';
import { budOut, graphPathKinds, linkRoute, travelRoute } from './crew';
import { JOB_SECONDS } from './fanOut';
import { fullSystem } from './fullSystem';
import { agentCard, gateCard, type HoverTarget, nodeCard } from './hoverCards';
import { HumanLoop } from './humanLoop';
import { D3V1N_REQUEST, GATEWAY, HOME, ROVO_HOME } from './layout';
import { leaveBase } from './leaveBase';
import { opening } from './opening';
import { absorb, handOff } from './request';
import { revealGate, revealNode } from './revealMap';
import { Tertiaries } from './tertiary';
import { Roster } from './roster';
import { type OutputLine, type OutputPlace, shipOutput } from './shipOutput';
import type { SystemMap } from './SystemMap';
import type { TeamworkGraph } from './TeamworkGraph';
import { fly, tween, wait } from './timeline';
import { teamworkGraph, type TwoActScene, twoActScene } from './twoActs';
import { ATLASSIAN, D3V1N_ID, nodeId, ROVO_ID, TOOLS, Volume, type Worker } from './volume';

/** The v2 story's beats, in order. */
export const V2_BEATS = ['opening', 'own-system', 'rovo-bridge', 'juiced-crew', 'ship-output', 'full-system'] as const;
export type V2Beat = (typeof V2_BEATS)[number];

/** How high the clouds float over this scene. */
export const V2_CLOUD_HEIGHT = 3.4;
/** D3V1N floats in from off the grid, front-left of its home. */
const D3V1N_FROM = HOME.clone().set(HOME.x - 6, 0, HOME.z + 3);
/** Rovo comes in on its own from off the grid, back-right of its home. */
const ROVO_FROM = ROVO_HOME.clone().set(ROVO_HOME.x + 5, 0, ROVO_HOME.z - 3);
/** Power packets that come through the tunnel to D3V1N. */
const POWER_PACKETS = 4;
/** A sub-agent buds off its parent this small, and grows as it flies out. */
const BUD_SCALE = 0.25;
/** Juiced, a branch takes half the time it took D3V1N's first sub-agent alone. */
const BRANCH_SECONDS = JOB_SECONDS.github * 0.5;
/** Seconds between commits each writer sends to GitHub. */
const COMMIT_EVERY = 0.65;

/**
 * The output line on this grid: from GitHub back past D3V1N's system to an
 * assembler, then a belt along open floor behind the tools into a portal,
 * clear of both systems' lines and the gateway.
 */
const OUTPUT = {
  assembler: new Vector3(0, 0, -4),
  beltFrom: new Vector3(0.8, 0, -4),
  beltLength: 2,
  beltSpeed: 2.2,
  portal: new Vector3(3.6, 0, -4),
};
/** The middle of everything once the output line is in, for the camera's pull-back. */
const WHOLE_CENTER = new Vector3(5.5, 0, -2.5);

/** How close a sub-agent has to be to a tool to count as working at it. */
const AT_NODE = 1.6;

/** A branch being written on a tool, and how to stop it. */
interface Writer {
  sub: SpawnedDrone;
  at: SystemKind;
  spot: Vector3;
  /** The tertiary node it works, if the tool already had someone on it. */
  tertiary?: SystemNode | null;
}

/**
 * The reworked story, v2 (ILI-947): the new beats played on the two-system
 * scene, D3V1N's gate and its own third-party tools laid out by the grid
 * guide, and the Atlassian gate with Rovo's Teamwork Graph behind it.
 * `play(through)` runs the beats in order up to and including `through`;
 * `reset()` clears the stage for another run.
 */
export class StoryV2 {
  readonly scene: TwoActScene;
  readonly graph: TeamworkGraph;
  /** The secure bridge between the two systems: the super tunnel. */
  readonly gateway = new Gateway(GATEWAY);
  readonly cloud = new Cloud();
  readonly ticket = new Ticket();
  /** D3V1N's charge: off until power comes through the tunnel. */
  readonly charge = new Charge(GRAPH_COLOR);
  /** The human in the loop: clouds drifting by, dropping issues into Jira, Confluence and Notion. */
  readonly humans: HumanLoop;
  private rovo: SpawnedDrone | null = null;
  /** D3V1N's first sub-agent, at GitHub since beat 2. */
  private first: Writer | null = null;
  private stopFirstJob: () => void = () => {};
  private output: OutputLine | null = null;
  private cleanups: (() => void)[] = [];
  /** Tools an agent has called up so far: only these are on the grid. */
  private readonly called = new Set<SystemKind>();
  private readonly calls = new Map<SystemKind, Promise<void>>();
  /** Rovo's Teamwork Graph is up: called tools get its lines too. */
  private graphUp = false;
  /** Volume of work across the grid: what hover cards report. */
  readonly volume: Volume;
  /** Every drone comes and goes through here, in one sequence per run (see `roster.log`). */
  readonly roster: Roster;
  /** Agents sharing a tool: each one after the first works a tertiary node of its own off it. */
  readonly tertiaries: Tertiaries;

  /** `seed` sets the run's ambient variation (crew, helpers, clouds): the same seed plays the same run every time. */
  constructor(
    private readonly stage: SceneHost,
    private readonly seed = 5,
  ) {
    this.roster = new Roster(stage);
    this.tertiaries = new Tertiaries(stage, () => this.floorTaken());
    this.scene = twoActScene(stage);
    // Nothing's mapped yet: each system shows only once its agent gets access.
    this.scene.act1.map.hide();
    this.scene.act2.map.hide();
    // Gates aren't on the grid either until their agent calls them.
    this.scene.act1.gate.visible = this.scene.act2.gate.visible = false;
    this.graph = teamworkGraph(stage, this.scene);
    // The tunnel's data flows only while the graph's feeder lines are connected to its ends.
    this.graph.feed(this.gateway.conduit);
    this.cloud.visible = false;
    this.ticket.scale.setScalar(0.7);
    this.ticket.visible = false;
    this.drone.rig.hover.add(this.charge);
    stage.add(this.cloud, this.ticket, this.gateway);
    stage.onTick((dt) => {
      if (this.cloud.visible) this.cloud.update(dt);
      this.ticket.update(dt);
      this.gateway.update(dt);
      this.charge.update(dt);
    });
    this.humans = new HumanLoop(stage, this.nodes(), seed + 2);
    this.volume = new Volume(stage, this.scene, () => this.workers(), 11);
  }

  /**
   * Everyone on the grid who can be working right now: D3V1N, Rovo once it's
   * here, and every sub-agent out at a tool (named by the tool it's at, and
   * counted for its parent by lineage).
   */
  workers(): Worker[] {
    const out: Worker[] = [{ id: D3V1N_ID, drone: this.drone }];
    if (this.rovo) out.push({ id: ROVO_ID, drone: this.rovo.drone });
    const nodes = Object.values(this.nodes()).filter((n) => n.visible);
    const seen = new Map<SystemKind, number>();
    for (const child of this.drone.parent?.children ?? []) {
      if (!(child instanceof Drone) || !child.subAgent || !child.visible) continue;
      const near = nodes.find((n) => Math.hypot(n.position.x - child.position.x, n.position.z - child.position.z) < AT_NODE);
      if (!near) continue;
      const n = seen.get(near.kind) ?? 0;
      seen.set(near.kind, n + 1);
      out.push({
        id: `sub:${near.kind}:${n}`,
        drone: child,
        parentId: child.lineage === 'cyan' ? ROVO_ID : D3V1N_ID,
        nodeId: nodeId(near.kind),
      });
    }
    return out;
  }

  /** What you can hover on the grid and the card each shows: gates, tools, agents, sub-agents. */
  hoverTargets(): HoverTarget[] {
    const ledger = this.volume.ledger;
    const workers = this.workers().filter((w) => ledger.has(w.id));
    const name = (id: string) => ledger.entity(id).name;
    const crewOf = (w: Worker): string[] =>
      w.parentId
        ? [name(w.parentId), ...(w.nodeId ? [name(w.nodeId)] : [])]
        : workers.filter((o) => o.parentId === w.id).map((o) => name(o.id));
    return [
      { object: this.scene.act1.gate, card: () => gateCard(ledger, TOOLS) },
      { object: this.scene.act2.gate, card: () => gateCard(ledger, ATLASSIAN) },
      ...Object.values(this.nodes()).map((node) => ({
        object: node,
        card: () => nodeCard(ledger, nodeId(node.kind), node.kind),
      })),
      ...workers.map((w) => ({ object: w.drone, card: () => agentCard(ledger, w.id, crewOf(w)) })),
    ];
  }

  get drone(): Drone {
    return this.scene.drone;
  }

  /** Rovo, once it's arrived. */
  get rovoDrone(): Drone | null {
    return this.rovo?.drone ?? null;
  }

  /** Every tool on the grid, by kind, across both systems. */
  nodes(): Record<SystemKind, SystemNode> {
    const all = [...this.scene.act1.map.nodes, ...this.scene.act2.map.nodes];
    return Object.fromEntries(all.map((n) => [n.kind, n])) as Record<SystemKind, SystemNode>;
  }

  /** Play from the top through `through`, in order. */
  async play(through: V2Beat = V2_BEATS[V2_BEATS.length - 1]): Promise<void> {
    const { stage, roster } = this;
    const upTo = V2_BEATS.indexOf(through);
    roster.begin();
    // Beat 1: a cloud drops DEMO-1 in front of D3V1N's home; D3V1N floats in and notices it.
    await opening(
      stage,
      this,
      { spot: D3V1N_REQUEST, cloudHeight: V2_CLOUD_HEIGHT, droneFrom: D3V1N_FROM, droneTo: HOME },
      (step) => step === 'drone' && roster.arrive(this.drone),
    );
    if (upTo < 1) return;
    await wait(stage, 0.6);
    if (!(await this.ownSystem())) return;
    if (upTo < 2) return;
    await wait(stage, 2);
    await this.rovoBridge();
    if (upTo < 3) return;
    await wait(stage, 1);
    await this.juicedCrew();
    if (upTo < 4) return;
    await wait(stage, 2);
    const output = await shipOutput(stage, this.outputPlace());
    this.output = output;
    this.cleanups.push(() => {
      output.stop();
      this.output = null;
    });
    if (upTo < 5) return;
    await wait(stage, 2.5);
    await this.fullSystem();
  }

  /**
   * Beat 2: D3V1N in its own system. It takes the ticket and calls its gate,
   * which pops up out of the floor; it flies there and checks access
   * (yellow, then green). Then it calls GitHub, and only GitHub: its trace
   * draws out over the faint grid, the tool rises, and the line fades off.
   * Its other tools stay off the grid until someone calls them. It sends one
   * sub-agent along the trace to GitHub, which starts a branch and keeps
   * working. From here on, clouds drift by and drop issues into whichever
   * human tools are on the grid. Resolves false if the gate denies access.
   */
  private async ownSystem(): Promise<boolean> {
    const { stage, drone, ticket, scene } = this;
    const { gate, map } = scene.act1;
    await handOff(stage, ticket, drone);
    await absorb(stage, ticket);
    await revealGate(stage, gate);
    if (!(await accessCheck(stage, drone, gate))) return false;
    await this.call('github');
    this.humans.start();
    this.cleanups.push(() => this.humans.stop());

    // One sub-agent to GitHub, along D3V1N's trace, to start a branch.
    const github = this.node('github');
    const route = this.ownRoute(map, 'github');
    this.cleanups.push(this.tertiaries.claim(github).release);
    const sub = await budOut(stage, drone, `${drone.name}.1`, route, github.position, 4.2, undefined, this.roster.spawn);
    sub.drone.rotation.y = FACE_CAMERA;
    this.first = { sub, at: 'github', spot: github.position.clone() };
    this.cleanups.push(() => {
      this.first?.sub.despawn();
      this.first = null;
    });
    github.light = 'working';
    const job = new Job('github');
    job.position.copy(github.position);
    job.rotation.y = FACE_CAMERA;
    stage.add(job);
    let t = 0;
    const untick = stage.onTick((dt) => {
      job.update(dt);
      // Builds the branch, holds it a moment, and goes again: it keeps working.
      t = (t + dt) % (JOB_SECONDS.github + 1.5);
      job.progress = Math.min(1, t / JOB_SECONDS.github);
    });
    let stopped = false;
    this.stopFirstJob = () => {
      if (stopped) return;
      stopped = true;
      untick();
      job.removeFromParent();
    };
    this.cleanups.push(() => this.stopFirstJob());
    this.cleanups.push(() => untuck(github));
    await tuck(stage, github);
    return true;
  }

  /**
   * Beat 3: Rovo arrives on its own, gets access at the Atlassian gate, and
   * its Teamwork Graph maps out (Jira, Confluence, Bitbucket, Code search
   * rise). One of its sub-agents builds the secure bridge between the two
   * systems: the glass tunnel scales up, it drops the lock, and it goes back
   * to dissolve into Rovo. The graph's lines draw in and connect to the
   * tunnel's ends, and data starts streaming through it: the super tunnel.
   * Power comes through it to D3V1N, which charges up. It's juiced.
   */
  private async rovoBridge(): Promise<void> {
    const { stage, scene, gateway, graph, drone, charge } = this;
    const { gate, map } = scene.act2;

    // Rovo flies in from off the grid to its home, then to its gate.
    const rovo = this.roster.spawn(stage, ROVO_FROM.x, ROVO_FROM.z, {
      name: 'Rovo',
      lineage: 'cyan',
      showLabel: true,
      status: 'working',
    });
    this.rovo = rovo;
    rovo.drone.fade = 0;
    await Promise.all([
      fly(stage, DroneFlight.to(rovo.drone, ROVO_HOME, { speed: 3 })),
      tween(stage, 0.8, (t) => (rovo.drone.fade = t)),
    ]);
    rovo.drone.flash = 1;
    scene.act2.signal = attachSignal(stage, rovo.drone, gate);
    // Rovo calls its gate, gets access, and calls Jira: where D3V1N's ticket lives.
    await revealGate(stage, gate);
    if (!(await accessCheck(stage, rovo.drone, gate))) return;
    await this.call('jira');
    rovo.drone.status = 'working';
    await wait(stage, 0.4);

    // A Rovo sub-agent builds the bridge.
    const builder = this.roster.spawn(stage, rovo.drone.position.x, rovo.drone.position.z, {
      name: `${rovo.drone.name}.1`,
      lineage: rovo.drone.lineage,
      subAgent: true,
      status: 'working',
    });
    rovo.drone.flash = 1;
    await Promise.all([
      fly(stage, DroneFlight.to(builder.drone, gateway.center, { speed: 4 })),
      tween(stage, 0.8, (t) => builder.drone.scale.setScalar(SUB_AGENT_SCALE * (BUD_SCALE + (1 - BUD_SCALE) * t))),
    ]);
    builder.drone.status = 'waiting';
    await tween(stage, 0.9, (t) => (gateway.built = t * t * (3 - 2 * t)));
    builder.drone.rig.hover.getWorldPosition(gateway.dropFrom);
    builder.drone.flash = 1;
    await tween(stage, 0.8, (t) => (gateway.lockDrop = t));
    gateway.grant();
    await wait(stage, 0.4);
    // Job done: back to Rovo, dock, dissolve into it.
    builder.drone.status = 'working';
    await fly(stage, DroneFlight.to(builder.drone, rovo.drone.position, { speed: 4 }));
    await tween(stage, 0.45, (t) => {
      builder.drone.scale.setScalar(SUB_AGENT_SCALE * (1 - t * 0.7));
      builder.drone.fade = 1 - t;
    });
    builder.despawn();
    rovo.drone.flash = 1;

    // The graph's lines draw in among the tools on the grid and connect to the tunnel's ends; data streams through it.
    this.graphUp = true;
    await graph.revealAmong(stage, this.called);
    await tween(stage, 1, (t) => (gateway.conduit.streams = t));

    // Power from Rovo, along the graph and through the tunnel, to D3V1N: it charges up.
    const power = new CurvePath<Vector3>();
    power.add(this.ownRoute(map, 'jira'));
    power.add(linkRoute(graph, 'jira', 'github'));
    power.add(reversed(this.ownRoute(scene.act1.map, 'github')));
    await Promise.all(
      Array.from({ length: POWER_PACKETS }, async (_, i) => {
        await wait(stage, i * 0.35);
        await shoot(stage, power, 7, graph.boost);
        charge.level = Math.max(charge.level, (i + 1) / POWER_PACKETS);
        drone.flash = 1;
      }),
    );
    charge.burst();
    gateway.grant();
    await tween(stage, 0.5, (t) => drone.scale.setScalar(1 + Math.sin(t * Math.PI) * 0.2 + t * 0.12));
  }

  /**
   * Beat 4: juiced, D3V1N runs three sub-agents writing code in parallel.
   * Its first stays on GitHub; two more bud off and ride the graph through
   * the super tunnel to Bitbucket (the gateway flashes green as each passes)
   * and work side by side there. All three build branches at twice the old
   * pace, and their commits keep landing in GitHub, Bitbucket's along the
   * graph and back through the tunnel.
   */
  private async juicedCrew(): Promise<void> {
    const { stage, drone, scene } = this;
    const github = this.node('github');
    const bitbucket = this.node('bitbucket');
    // D3V1N calls Bitbucket: it comes up on Rovo's side, with its graph lines.
    await this.call('bitbucket');
    const toBitbucket = new CurvePath<Vector3>();
    toBitbucket.add(this.ownRoute(scene.act1.map, 'github'));
    toBitbucket.add(this.travel('github', 'bitbucket'));
    drone.flash = 1;
    const tucked = tuck(stage, bitbucket);
    this.cleanups.push(() => untuck(bitbucket));
    const watch = this.throughGateway();
    // Two go to Bitbucket: the first works the tool itself, the second a tertiary node of its own off it.
    const writers = await Promise.all(
      [0, 1].map(async (i): Promise<Writer> => {
        await wait(stage, i * 0.45);
        const place = this.tertiaries.claim(bitbucket);
        this.cleanups.push(place.release);
        const sub = await budOut(stage, drone, `${drone.name}.${i + 2}`, toBitbucket, place.spot, 4.2, watch, this.roster.spawn);
        return { sub, at: 'bitbucket', spot: place.spot, tertiary: place.tertiary };
      }),
    );
    this.cleanups.push(() => writers.forEach((w) => w.sub.despawn()));
    await tucked;
    bitbucket.light = 'working';
    // The first sub-agent's slow branch gives way to the juiced pace.
    this.stopFirstJob();
    const all = this.first ? [this.first, ...writers] : writers;
    const stops = all.map((w, i) => this.write(w, github.position, i));
    this.cleanups.push(() => stops.forEach((stop) => stop()));
  }

  /**
   * One sub-agent writing code: its branch builds at the juiced pace and
   * loops, and every so often a commit goes to GitHub (from Bitbucket, along
   * the graph and through the tunnel). Returns a function that stops it.
   */
  private write(w: Writer, githubAt: Vector3, i: number): () => void {
    const { stage, graph } = this;
    const job = new Job('github');
    job.position.copy(w.spot);
    job.rotation.y = FACE_CAMERA;
    job.scale.setScalar(w.tertiary ? 0.6 : w.at === 'bitbucket' ? 0.8 : 1);
    stage.add(job);
    if (w.tertiary) w.tertiary.emblem.visible = false;
    const feed: Curve<Vector3> =
      w.at === 'github' ? new LineCurve3(w.spot.clone(), githubAt.clone()) : this.graphRoute('bitbucket', 'github');
    let t = (i * 0.37) % 1;
    let since = i * 0.3;
    const untick = stage.onTick((dt) => {
      job.update(dt);
      t = (t + dt / BRANCH_SECONDS) % 1.2;
      job.progress = MathUtils.clamp(t, 0, 1);
      since += dt;
      // A tertiary's work flows into its tool along its trace; the tool's own writer sends the commits on.
      if (since < COMMIT_EVERY || w.tertiary) return;
      since = 0;
      void shoot(stage, feed, w.at === 'github' ? 3 : 7, graph.boost, w.at).then(() => {
        w.sub.drone.flash = Math.max(w.sub.drone.flash, 0.5);
        this.output?.commit();
      });
    });
    return () => {
      untick();
      job.removeFromParent();
    };
  }

  /**
   * Beat 6: the whole system at work. D3V1N's crew spreads across both
   * systems (its own tools along its traces, Rovo's through the super
   * tunnel), Rovo's helpers come and go on its tools, products flow to GitHub
   * and out the portal, and the camera pulls back to take it all in.
   */
  private async fullSystem(): Promise<void> {
    const { stage, scene, graph, drone } = this;
    const rovo = this.rovo!.drone;
    const camera = this.pullBack();
    this.cleanups.push(camera.restore);
    const own = new Set(scene.act1.map.nodes.map((n) => n.kind));
    const stop = await fullSystem(
      stage,
      {
        drone,
        rovo,
        nodes: this.nodes(),
        graph,
        routeTo: (kind) => {
          if (own.has(kind)) return this.ownRoute(scene.act1.map, kind);
          // The rest of the grid is Rovo's: out to GitHub, then along the graph through the tunnel.
          const path = new CurvePath<Vector3>();
          path.add(this.ownRoute(scene.act1.map, 'github'));
          path.add(this.travel('github', kind));
          return path;
        },
        rovoRouteTo: (kind) => this.ownRoute(scene.act2.map, kind),
        boost: graph.boost,
        watch: this.throughGateway(),
        spawn: this.roster.spawn,
        call: (kind) => this.call(kind),
        onGrid: (kind) => this.called.has(kind),
        claim: (kind) => this.tertiaries.claim(this.node(kind)),
        onCommit: () => this.output?.commit(),
        pullBack: camera.to,
      },
      this.seed,
    );
    this.cleanups.push(stop);
  }

  /** A gate's own trace out to one of its tools. */
  private ownRoute(map: SystemMap, kind: SystemKind): Curve<Vector3> {
    return map.routes[map.nodes.findIndex((n) => n.kind === kind)];
  }

  /**
   * An agent calls a tool: it comes up on the grid (its trace from its gate
   * draws out over the faint grid, the tool rises, the line fades off), and
   * once Rovo's graph is up, the graph's lines to it draw in too. Calling a
   * tool that's already up (or coming up) waits for it.
   */
  call(kind: SystemKind): Promise<void> {
    let calling = this.calls.get(kind);
    if (!calling) {
      calling = (async () => {
        const { act1, act2 } = this.scene;
        const map = act1.map.nodes.some((n) => n.kind === kind) ? act1.map : act2.map;
        await revealNode(this.stage, map, map.nodes.findIndex((n) => n.kind === kind));
        this.called.add(kind);
        if (this.graphUp) await this.graph.revealAmong(this.stage, this.called);
      })();
      this.calls.set(kind, calling);
    }
    return calling;
  }

  /** The graph's way between two tools, through tools on the grid only: what work products ride. */
  private graphRoute(from: SystemKind, to: SystemKind): Curve<Vector3> {
    return linkRoute(this.graph, ...this.hops(from, to));
  }

  /** A sub-agent's way between two tools: straight within a system, through the tunnel between them. */
  private travel(from: SystemKind, to: SystemKind): Curve<Vector3> {
    return travelRoute(this.graph, ...this.hops(from, to));
  }

  private hops(from: SystemKind, to: SystemKind): SystemKind[] {
    const hops = graphPathKinds(this.graph, from, to, (k) => this.called.has(k));
    if (!hops) throw new Error(`StoryV2: no way along the graph from ${from} to ${to}`);
    return hops;
  }

  /** Where things stand on the floor (or will), for placing tertiary nodes clear of them. */
  private floorTaken(): Vector3[] {
    const { act1, act2 } = this.scene;
    const taken = [
      // Every tool and gate, called up yet or not: a tool that comes up later mustn't land on a tertiary.
      ...Object.values(this.nodes()).map((n) => n.position),
      act1.gate.position,
      act2.gate.position,
      // The tunnel, end to end, and the output line.
      ...[GATEWAY.from, (GATEWAY.from + GATEWAY.to) / 2, GATEWAY.to].map((x) => new Vector3(x, 0, (GATEWAY.low + GATEWAY.high) / 2)),
    ];
    if (this.output) taken.push(OUTPUT.assembler, OUTPUT.beltFrom, OUTPUT.portal);
    return taken;
  }

  private node(kind: SystemKind): SystemNode {
    return this.nodes()[kind];
  }

  /** Watches a flying sub-agent: the moment it enters the tunnel, the gateway flashes green and it acknowledges. */
  private throughGateway(): (drone: Drone) => void {
    const through = new WeakSet<Drone>();
    return (drone) => {
      if (through.has(drone) || !inRun(GATEWAY, drone.position)) return;
      through.add(drone);
      this.gateway.grant();
      drone.flash = 1;
    };
  }

  /** Where the output line goes on this grid: from GitHub back to the assembler, then the belt and the portal. */
  private outputPlace(): OutputPlace {
    const from = this.node('github').position;
    const to = OUTPUT.assembler;
    const line = [from.clone(), new Vector3(to.x, 0, from.z), to.clone()];
    return { route: roundedPath(trimPolyline(line, NODE_FOOTPRINT / 2, 0.35), BEND_RADIUS), ...OUTPUT };
  }

  /**
   * The camera pulling back to the whole grid for the last beat, if the stage
   * has a camera to move (a real Stage; not in tests): zoom out a little and
   * re-center on everything. `restore` puts it back.
   */
  private pullBack(): { to?: (t: number) => void; restore: () => void } {
    const s = this.stage as Partial<Stage>;
    if (!s.camera || !s.controls || !s.centerOn) return { restore: () => {} };
    const camera = s.camera;
    const zoom = camera.zoom;
    const center = s.controls.target.clone();
    const whole = WHOLE_CENTER.clone().setY(center.y);
    const at = new Vector3();
    const set = (z: number, c: Vector3) => {
      camera.zoom = z;
      camera.updateProjectionMatrix();
      s.centerOn!(c);
    };
    return {
      to: (t) => set(zoom * (1 - 0.12 * t), at.lerpVectors(center, whole, t)),
      restore: () => set(zoom, center),
    };
  }

  /**
   * Fade everything out and put the stage back as it was before the opening.
   * Work stops first; then every drone still out leaves through the roster,
   * newest first (Rovo after its helpers and D3V1N's crew), and D3V1N last.
   */
  async reset(): Promise<void> {
    const { stage, scene, drone, ticket, gateway, graph, charge, roster } = this;
    roster.freeze();
    for (const cleanup of this.cleanups.splice(0).reverse()) cleanup();
    this.tertiaries.clear();
    await Promise.all([
      roster.clear(),
      tween(stage, 0.8, (t) => {
        charge.level = Math.min(charge.level, 1 - t);
        gateway.built = Math.min(gateway.built, 1 - t);
        gateway.lockDrop = Math.min(gateway.lockDrop, 1 - t);
      }),
    ]);
    ticket.visible = false;
    graph.hide();
    gateway.conduit.streams = 0;
    scene.act2.signal?.detach();
    scene.act2.signal = null;
    this.rovo = null;
    scene.act2.gate.state = 'off';
    const { gate, signal } = scene.act1;
    if (gate.state !== 'off') await leaveBase(stage, { drone, gate, signal }, HOME);
    if (drone.fade > 0) roster.depart(drone);
    await tween(stage, 0.6, (t) => (drone.fade = Math.min(drone.fade, 1 - t)));
    drone.scale.setScalar(1);
    drone.status = 'waiting';
    // Gates sink back into the floor; everything called goes off the grid again.
    await tween(stage, 0.4, (t) => {
      for (const g of [scene.act1.gate, scene.act2.gate]) if (g.visible) g.scale.setScalar(Math.max(0.001, 1 - t));
    });
    scene.act1.gate.visible = scene.act2.gate.visible = false;
    this.called.clear();
    this.calls.clear();
    this.graphUp = false;
    scene.act1.map.hide();
    scene.act2.map.hide();
    for (const node of Object.values(this.nodes())) node.dim = 0;
  }
}

/** A node's emblem tucks away so a branch can build on it. */
async function tuck(stage: SceneHost, node: SystemNode): Promise<void> {
  await tween(stage, 0.4, (t) => node.emblem.scale.setScalar(EMBLEM_SCALE * Math.max(0.001, 1 - t)));
  node.emblem.visible = false;
}

/** Its emblem back, its light off. */
function untuck(node: SystemNode): void {
  node.emblem.visible = true;
  node.emblem.scale.setScalar(EMBLEM_SCALE);
  node.light = 'off';
}
