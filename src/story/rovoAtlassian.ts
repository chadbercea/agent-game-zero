import { LineCurve3, type Object3D, Vector3 } from 'three';
import { DroneFlight } from '../animation/DroneFlight';
import { GateAnimator } from '../animation/GateAnimator';
import { BEND_RADIUS, FACE_CAMERA, GATE_FOOTPRINT, NODE_FOOTPRINT } from '../core/grid';
import { NEUTRAL } from '../core/palette';
import { seededRandom } from '../core/scatter';
import { Branch } from '../primitives/branch/Branch';
import { reversed, roundedPath, trimPolyline } from '../primitives/branch/gridPath';
import { HOVER_HEIGHT, SUB_AGENT_SCALE } from '../primitives/drone/Drone';
import { Gate } from '../primitives/gate/Gate';
import { Padlock } from '../primitives/gate/Padlock';
import type { Drone } from '../primitives/drone/Drone';
import { Job as JobAnimation } from '../primitives/job/Job';
import { RepoTrunk } from '../primitives/job/RepoTrunk';
import { hasJob, type ScmKind, type SystemKind } from '../primitives/node/emblems';
import { PERMANENT_TOP, SystemNode } from '../primitives/node/SystemNode';
import type { Request, Ticket } from '../primitives/ticket/Ticket';
import { TERMINAL_SIZE, Terminal } from '../primitives/terminal/Terminal';
import { attachSignal } from '../stage/attachSignal';
import { type SpawnedDrone, spawnDrone } from '../stage/spawnDrone';
import type { SceneHost } from '../stage/Stage';
import { accessCheck } from './accessCheck';
import { shoot } from './beam';
import { JIRA_EDGE, JiraHub } from './jiraHub';
import { makeTask, type Step, TASK_TITLE, TASK_TYPES, type Task } from './rovoTasks';
import { type PlacedSystem, SystemsOnGrid, TWG_SCALE } from './rovoSystems';
import { buildOutput, CodeLane } from './rovoCode';
import type { OutputLine } from './shipOutput';
import { SlackHub } from './rovoSlack';
import { type StoryMap, storyMap } from './storyMap';
import { fly, tween, wait } from './timeline';

/** The mini systems: laid out round Jira from the seed by the house layout rules (storyMap, systemLayout). */
export const MINI_SYSTEMS: readonly SystemKind[] = ['confluence', 'figma', 'gdocs', 'notion'];

export interface RovoStoryOptions {
  /** The mini systems this story uses (all four if left out); only these are laid out on its map. */
  mini?: readonly SystemKind[];
  /** Lay out production past the portal (storyMap). */
  production?: boolean;
  /** Lay out PagerDuty, Datadog and the on-call person's phone (storyMap). */
  paging?: boolean;
  /** Systems that hang off another system rather than Jira, beyond Code search off Bitbucket. */
  via?: Partial<Record<SystemKind, SystemKind>>;
}

const WORK: [number, number] = [1.1, 1.9];
/** Emblems sway slowly at idle, like a system map's (SystemMap). */
const SWAY = 0.35;
/** A coder only takes code tasks. */
const NOT_CODE = TASK_TYPES.filter((t) => t !== 'code');
/** Little cubes a deploy sends down the output line: two merges fill the assembler's 2 × 2 × 2. */
export const DEPLOY_CUBES = 4;
/** A job animation takes a little longer than plain work, so it reads. */
const JOB_STRETCH = 1.6;
/** A job animation stands bigger than its tool's emblem, so it reads at this zoom. */
const JOB_SCALE = 1.4;
const TASK_GAP: [number, number] = [0.9, 2.2];
/** Rovo's crew: always 1–3 coders working branches; a few more in the mini systems; never more than this in all. */
export const MAX_CREW = 5;
const MAX_LOOPERS = 2;
export const SUB_SPEED = 4;
/** Seconds a sub-agent takes to fade into being inside Rovo before it flies out. */
export const EMERGE_SECONDS = 0.25;
/** How high the padlock floats over the gate once Rovo is through. */
const LOCK_HEIGHT = 0.9;

/** How high a sub-agent's floor anchor sits for its body to be level with Rovo's body. */
export const AT_ROVOS_BODY = HOVER_HEIGHT * (1 - SUB_AGENT_SCALE);

/** A copy of Rovo out on the grid, and the height it's flying at. */
export interface Copy {
  sub: SpawnedDrone;
  from: number;
}

/** One Jira task, run by one copy of Rovo. */
export interface TaskRun {
  id: string;
  /** Its Jira issue: key and title. */
  key: string;
  title: string;
  task: Task;
  /** Steps finished so far. */
  done: number;
}

/**
 * Rovo and Jira, the quarterback (Story Narrative; docs/rovo-mental-model.md).
 * Rovo floats in, authenticates at its gate (which locks behind it), moves
 * into Jira and works from there: Jira is the system of record.
 *
 * Tasks keep coming onto Jira's board. Rovo is the only real agent: for each
 * task it sends a copy of itself (one to three at once, seeded), set up for
 * that task. A copy takes its card and runs the task's steps one at a time:
 * it flies to each system the step needs (bringing it up on the grid the first
 * time; see SystemsOnGrid), works there while hovering over it, and the step
 * reports to Jira along the system's Graph Line. Then the card goes to Done
 * and the copy flies home into Rovo.
 */
export class RovoAtlassian {
  readonly rovo: SpawnedDrone;
  readonly gate = new Gate();
  /** Locks the gate behind Rovo once it's through, for security. */
  readonly lock = new Padlock();
  readonly jira: SystemNode;
  readonly hub: JiraHub;
  /** The line from the gate into Jira: Rovo's way in. */
  readonly accessLine: Branch;
  /** Rovo's crew this run (seeded): 1–3 coders (one per lane, always working branches) and 1–2 in the mini systems, 5 at most. */
  readonly codeCrew: number;
  readonly loopCrew: number;
  /** The coding lanes in use (up to three), by lane index. */
  readonly lanes: (CodeLane | null)[] = [null, null, null];
  /** The output (line, assembler, belt, portal), once code has first merged. */
  output?: OutputLine;
  /** Every task started, in order. */
  readonly tasks: TaskRun[] = [];
  /** The systems on the grid. */
  readonly systems: SystemsOnGrid;
  /** The repo every code task goes to: Bitbucket (on the Teamwork Graph, standing from the start of work). */
  readonly scm: ScmKind;
  /** The repo's trunk at the SCM: one commit per merge (its final state). */
  readonly trunk = new RepoTrunk();
  /** Rovo's copies out on the grid, with the ticket and task each holds right now (none while it waits). */
  readonly copies = new Map<Drone, { card?: Ticket; run?: TaskRun }>();
  /** Jira issues handed out so far. */
  protected issues = 0;
  /** Copies at work right now, and the node each is working (always over it). */
  readonly working = new Map<Drone, Object3D>();
  /** Slack, the comms hub behind its gateway (up once a copy first sends a message). */
  readonly slack: SlackHub;
  /** The user's terminal, where a copy reports back (once a task first needs it). */
  terminal?: Terminal;
  /** This run's map, from its seed: where everything stands (storyMap). */
  readonly map: StoryMap;
  /** Where each system stands this run (from the map). */
  readonly places: Partial<Record<SystemKind, Vector3>>;
  /** Where a copy reading Figma through MCP builds its terminal (the MCP client), beside Figma. */
  readonly mcpAt?: Vector3;
  /** Times a copy has updated the user's terminal. */
  userReports = 0;
  /** Reads through Figma's MCP server so far, and the MCP client terminal while one is up. */
  mcpReads = 0;
  mcpTerminal?: Terminal;
  private mcpSession: Promise<number> = Promise.resolve(0);
  private terminalUp?: Promise<Terminal>;
  /** Every copy Rovo can run at once. */
  get crew(): number {
    return this.codeCrew + this.loopCrew;
  }

  /** Rovo is in Jira (after authenticating). */
  inJira = false;
  out = 0;
  codeOut = 0;
  peakOut = 0;
  /** Releases through the portal so far (each a 2 × 2 × 2 of merged code). */
  shipped = 0;
  protected building?: Promise<OutputLine>;
  /** Little cubes each deploy sends down the output line. */
  protected deployCubes = DEPLOY_CUBES;
  /** The next CI run fails once (red), then passes on the retry. */
  protected flakyCI = false;
  /** CI runs that failed and were retried. */
  ciRetries = 0;
  /** Merges at the repo happen one at a time. */
  private merging: Promise<void> = Promise.resolve();
  /** Copies update the user's terminal one at a time. */
  private reporting: Promise<void> = Promise.resolve();
  protected readonly random: () => number;
  protected running = false;
  protected subs = 0;

  constructor(
    protected readonly stage: SceneHost,
    seed = 3,
    options: RovoStoryOptions = {},
  ) {
    this.random = seededRandom(seed);
    const map = (this.map = storyMap(seed, { mini: options.mini ?? MINI_SYSTEMS, production: options.production, paging: options.paging }));
    this.codeCrew = 1 + Math.floor(this.random() * 3);
    this.loopCrew = 1 + Math.floor(this.random() * Math.min(MAX_LOOPERS, MAX_CREW - this.codeCrew));
    // Bitbucket, a Teamwork Graph app, is the repo: the code side's activity is all around it.
    this.scm = 'bitbucket';
    this.gate.position.copy(this.map.gate);
    const animator = new GateAnimator(this.gate);
    stage.onTick((dt) => animator.update(dt));
    stage.add(this.gate);
    this.lock.position.copy(this.map.gate).setY(LOCK_HEIGHT);
    this.lock.shown = 0;
    this.lock.shut = 0;
    stage.add(this.lock);
    this.jira = new SystemNode({ kind: 'jira', permanent: true });
    this.jira.position.copy(this.map.jira);
    stage.add(this.jira);
    this.hub = new JiraHub(
      stage,
      this.jira,
      () => [
        map.gate,
        ...this.systems.positions(),
        ...this.lanes.flatMap((l) => l?.positions() ?? []),
        map.code.assembler,
        map.code.portal,
        map.slack.at,
        this.slack.gateway.center,
        map.userTerminal,
      ],
      this.random,
    );
    this.slack = new SlackHub(stage, map.slack, map.jira.clone().addScaledVector(map.slack.out, JIRA_EDGE + 0.05), this.random);
    this.places = map.places;
    this.mcpAt = map.mcpAt;
    const tie = map.code.tieSide;
    this.systems = new SystemsOnGrid(stage, this.hub, this.places, { github: tie, bitbucket: tie, gitlab: tie }, map.routes, { codesearch: 'bitbucket', ...options.via }, viaRoutes(map, options.via ?? {}));
    let clock = 0;
    stage.onTick((dt) => {
      clock += dt;
      [...this.systems.placed.values()].forEach((up, i) => (up.node.emblem.rotation.y = FACE_CAMERA + Math.sin(clock * 0.5 + i) * SWAY));
      this.slack.node.emblem.rotation.y = FACE_CAMERA + Math.sin(clock * 0.5 + 7) * SWAY;
    });
    // The repo's trunk stands on the SCM node's slab, at its right-hand corner, and is only there while the SCM is:
    // a third-party SCM goes when its tasks are done and takes its trunk with it (it keeps its commits for next time).
    const repo = map.code.scm;
    this.trunk.position.set(repo.x + 0.3 * TWG_SCALE, PERMANENT_TOP * TWG_SCALE, repo.z - 0.3 * TWG_SCALE);
    stage.add(this.trunk);
    stage.onTick((dt) => {
      const up = this.systems.placed.get(this.scm);
      this.trunk.visible = !!up;
      if (up) this.trunk.scale.setScalar(up.node.scale.x);
      this.trunk.update(dt);
      // The output line runs out of the repo: it's drawn while the repo is up, and draws back while it's away.
      if (this.output) {
        const target = up ? 1 : 0.001;
        this.output.line.drawn += (target - this.output.line.drawn) * Math.min(1, dt * 3);
      }
    });
    // Along the grid, never diagonal: out of the gate toward the camera, round one corner, and into Jira.
    const corner = new Vector3(map.gate.x, 0, map.jira.z);
    this.accessLine = new Branch(
      roundedPath(trimPolyline([map.gate.clone(), corner, map.jira.clone()], GATE_FOOTPRINT / 2 + 0.05, JIRA_EDGE + 0.05), BEND_RADIUS),
      NEUTRAL.packet,
    );
    stage.add(this.accessLine);
    // Progressive: at first there's only Rovo. The gate, Jira and its board each come in when the story gets to them.
    this.accessLine.drawn = 0;
    this.gate.visible = false;
    this.gate.scale.setScalar(0.001);
    this.hub.hide();
    this.rovo = spawnDrone(stage, this.map.rovoStart.x, this.map.rovoStart.z, { name: 'Rovo', lineage: 'cyan', showLabel: true, status: 'waiting' });
    this.rovo.drone.fade = 0;
    attachSignal(stage, this.rovo.drone, this.gate);
    // Over Jira, Rovo talks with it the whole time it works there.
    attachSignal(stage, this.rovo.drone, this.jira);
  }

  /**
   * Progressive: Rovo alone; it flies over to its gate (which comes up as it
   * nears) and authenticates; Jira appears; Rovo moves in and goes to work;
   * then the kanban board shows up and tasks flow until `stop()`.
   */
  async start(): Promise<void> {
    const { hub } = this;
    this.running = true;
    await this.enter();
    // Work starts: the kanban board shows up.
    await hub.showBoard();
    for (let i = 0; i < 3; i++) await hub.addTask();
    void this.taskFeed();
    // Rovo's crew: copies that stay on. Coders each keep a lane; the rest run loops in the mini systems.
    const crew = [
      ...Array.from({ length: this.codeCrew }, (_, i) => this.copy(i)),
      ...Array.from({ length: this.loopCrew }, () => this.copy(-1)),
    ];
    await Promise.all(crew);
  }

  /**
   * Rovo's way in, the same in every story: alone, it flies to its gate (which
   * comes up as it nears) and authenticates; the line draws to Jira and Jira
   * comes up; Rovo moves in (the gate locks behind it), and the Teamwork
   * Graph's core comes up around it: Confluence, then Bitbucket.
   */
  protected async enter(): Promise<void> {
    const { stage, hub } = this;
    const rovo = this.rovo.drone;
    await tween(stage, 0.8, (t) => (rovo.fade = t));
    await wait(stage, 0.6);
    const toGate = fly(stage, DroneFlight.to(rovo, this.map.gate, { speed: 3 }));
    await wait(stage, 0.5);
    this.gate.visible = true;
    await tween(stage, 0.5, (t) => this.gate.scale.setScalar(Math.max(0.001, easeOutBack(t))));
    await toGate;
    await wait(stage, 0.3);
    await accessCheck(stage, rovo, this.gate, { thinkSeconds: 1.2 });
    await wait(stage, 0.3);
    // Access granted: the line draws out from the gate, then Jira comes up at its end.
    await tween(stage, 0.7, (t) => (this.accessLine.drawn = t));
    await hub.appear();
    await wait(stage, 0.3);
    // In through the gate, along its line, and into Jira: that's where Rovo works from.
    rovo.status = 'working';
    const flight = fly(stage, DroneFlight.to(rovo, this.map.jira, { speed: 3 }));
    // Once Rovo is away from the gate, it locks behind it.
    await wait(stage, 0.7);
    await this.lockGate();
    await flight;
    this.inJira = true;
    this.jira.light = 'working';
    // Rovo in Jira: the Teamwork Graph's core comes up around it, for good. Confluence, then Bitbucket.
    await this.systems.establish('confluence');
    await this.systems.establish('bitbucket');
    await wait(stage, 0.6);
  }

  /** A padlock fades in open over the gate, then snaps shut. The gate stays lit under it: security is on, not off. */
  protected async lockGate(): Promise<void> {
    const { stage, lock } = this;
    await tween(stage, 0.35, (t) => {
      lock.shown = t;
      lock.position.y = LOCK_HEIGHT + 0.25 * (1 - t);
    });
    await wait(stage, 0.15);
    await tween(stage, 0.18, (t) => (lock.shut = t * t));
  }

  stop(): void {
    this.running = false;
  }

  /** New tasks keep coming onto Jira's board. */
  private async taskFeed(): Promise<void> {
    while (this.running) {
      await wait(this.stage, this.between(TASK_GAP));
      await this.hub.addTask();
    }
  }

  /**
   * One copy of Rovo, for as long as Rovo works. It comes out of Rovo at its
   * first ticket and stays on: Rovo hands it a ticket (shoots it the card), it
   * runs that task, shoots the finished card back to Rovo, and waits right
   * where it is (yellow) for the next one. Only when the work stops does it fly
   * home into Rovo. A coder (`laneIndex` 0–2) only takes code tasks, in its own
   * lane; the others take everything else.
   */
  private async copy(laneIndex: number): Promise<void> {
    const { stage, hub } = this;
    const rovo = this.rovo.drone;
    const coder = laneIndex >= 0;
    let sub: SpawnedDrone | undefined;
    let from = AT_ROVOS_BODY;
    while (this.running) {
      if (hub.board.length === 0) {
        await wait(stage, 0.4);
        continue;
      }
      if (!sub) {
        // Born inside Rovo, full size, at its first ticket.
        sub = spawnDrone(stage, rovo.position.x, rovo.position.z, { name: `Rovo.${++this.subs}`, lineage: 'cyan', subAgent: true, status: 'waiting' });
        sub.drone.position.y = AT_ROVOS_BODY;
        sub.drone.fade = 0;
        rovo.flash = 1;
        const drone = sub.drone;
        await tween(stage, EMERGE_SECONDS, (t) => (drone.fade = t));
      }
      // Rovo hands it the next ticket off the board: a Jira issue of its own.
      rovo.flash = 1;
      const task = makeTask(this.random, { scm: this.scm, without: coder ? NOT_CODE : ['code'] });
      const card = await hub.takeTask(sub.drone.rig.hover, rovo.rig.hover, { key: `DEMO-${101 + this.issues++}`, title: TASK_TITLE[task.type] });
      if (!card) continue;
      sub.drone.status = 'working';
      const copy = { card, run: undefined as TaskRun | undefined };
      this.copies.set(sub.drone, copy);
      from = await this.runTask(sub, task, card, coder ? laneIndex : -1, from, (run) => (copy.run = run));
      // Done: it waits where it is for its next ticket.
      this.copies.set(sub.drone, {});
      sub.drone.status = 'waiting';
    }
    if (!sub) return;
    await fly(stage, DroneFlight.to(sub.drone, rovo.position, { speed: SUB_SPEED, fromHeight: from, toHeight: AT_ROVOS_BODY, lift: 0 }));
    const drone = sub.drone;
    await tween(stage, 0.3, (t) => (drone.fade = 1 - t));
    this.copies.delete(sub.drone);
    sub.despawn();
    rovo.flash = 1;
  }

  /**
   * One task, run by a copy holding its card: each step in turn (fly to the
   * system, work it while hovering over it, report to Jira), or for code its
   * lane; then the finished card is shot to Rovo and the systems only this
   * task needed go. Returns the copy's flying height where it ends up.
   */
  protected async runTask(
    sub: SpawnedDrone,
    task: Task,
    card: Ticket,
    laneIndex: number,
    startFrom: number,
    started: (run: TaskRun) => void = () => {},
  ): Promise<number> {
    const { stage, hub } = this;
    const rovo = this.rovo.drone;
    const run: TaskRun = { id: `task-${this.tasks.length + 1}`, key: card.request.key, title: card.request.title, task, done: 0 };
    this.tasks.push(run);
    started(run);
    const lane = laneIndex >= 0 ? new CodeLane(stage, laneIndex, this.tasks.length, this.map.code) : undefined;
    if (lane) {
      this.lanes[laneIndex] = lane;
      this.codeOut++;
    }
    this.out++;
    this.peakOut = Math.max(this.peakOut, this.out);

    let from = startFrom;
    if (lane) {
      await this.code(sub.drone, lane, from);
      run.done = run.task.steps.length;
      from = 0;
    }
    for (const step of lane ? [] : run.task.steps) {
      if (step.mcp) {
        from = await this.mcpRead(sub.drone, from);
        run.done++;
        continue;
      }
      if (step.system === 'slack') {
        // Slack stands on its own behind its gateway: the copy goes there, Slack comes up for it the first time,
        // and its message goes out through the gateway into Jira's record.
        await fly(stage, DroneFlight.to(sub.drone, this.map.slack.at, { speed: SUB_SPEED, fromHeight: from, lift: 0 }));
        from = 0;
        await this.slack.bringUp();
        this.working.set(sub.drone, this.slack.node);
        const signal = attachSignal(stage, sub.drone, this.slack.node);
        await wait(stage, this.between(WORK));
        await this.slack.send();
        signal.detach();
        this.working.delete(sub.drone);
        run.done++;
        continue;
      }
      // The copy goes first; the system comes up for it when it gets there (if it isn't up already).
      const at = step.system === 'jira' ? this.map.jira : (this.systems.placed.get(step.system)?.node.position ?? (this.places[step.system] as Vector3));
      await fly(stage, DroneFlight.to(sub.drone, at, { speed: SUB_SPEED, fromHeight: from, lift: 0 }));
      from = 0;
      const system = await this.systems.call(step.system);
      await this.work(sub.drone, system.node, step);
      if (step.system !== 'jira') {
        // A write stays where it was written (write-back); a read brings what it found home to Jira;
        // either way the step's status rides the system's Graph Line to Jira.
        if (step.action === 'read') void this.systems.report(step.system, step.system);
        else {
          this.systems.writeBack(step.system);
          void this.systems.report(step.system);
        }
      }
      run.done++;
    }
    if (run.task.reportToUser) {
      // Last, the copy updates the terminal back to the user: one copy at the terminal at a time, the others wait their turn where they are.
      const fromHere = from;
      const report = this.reporting.then(async () => {
        await fly(stage, DroneFlight.to(sub.drone, this.map.userTerminal, { speed: SUB_SPEED, fromHeight: fromHere, lift: 0 }));
        const terminal = await this.userTerminal();
        this.working.set(sub.drone, terminal);
        terminal.state = 'tail';
        await wait(stage, this.between(WORK));
        terminal.pass();
        await wait(stage, 0.5);
        terminal.state = 'admin';
        this.working.delete(sub.drone);
        this.userReports++;
      });
      this.reporting = report.catch(() => {});
      await report;
      from = 0;
    }

    // The task is done: a coding copy collapses its lane back into itself, then the card is shot to Rovo.
    if (lane) await lane.collapse();
    await hub.finish(card, rovo.rig.hover);
    rovo.flash = 1;
    if (lane) {
      lane.dispose();
      this.lanes[lane.index] = null;
      this.codeOut--;
    }
    this.out--;
    // Third-party tools this task called go, unless another open task still needs them.
    for (const step of run.task.steps) void this.systems.release(step.system);
    return from;
  }

  /**
   * A code task, linear like real life, kicked off by the copy: it flies to
   * its lane's spot and builds the lane out from itself (worktree → terminal →
   * repo, the repo coming up if it isn't), and works the worktree: its terminal sets up (admin) and the code is written (diff); it's
   * checked in (it rides worktree → terminal → repo); CI/CD runs (the terminal
   * tails its logs) and passes; it's squash-merged at the repo (the branch
   * folds in, the trunk keeps the commit) and deployed (small cubes shoot down
   * the output line to the assembler, belt and portal); and the status goes to Jira.
   */
  protected async code(drone: Drone, lane: CodeLane, from: number): Promise<void> {
    const { stage, hub } = this;
    // The copy goes out to its lane's spot and builds the lane out from itself, into the repo.
    await fly(stage, DroneFlight.to(drone, lane.spot, { speed: SUB_SPEED, fromHeight: from, lift: 0 }));
    this.working.set(drone, lane.worktree);
    let repo!: PlacedSystem;
    await lane.build(async () => (repo = await this.systems.call(this.scm)));
    this.buildOutputLine();
    lane.worktree.light = 'working';
    const signal = attachSignal(stage, drone, lane.worktree);
    const { terminal } = lane;
    terminal.state = 'admin';
    await wait(stage, this.between([1, 1.6]));
    terminal.state = 'diff';
    await wait(stage, this.between([2.2, 3.2]));
    await lane.checkIn(this.scm);
    await this.reviewed(drone, lane);
    terminal.state = 'tail';
    await wait(stage, this.between([1.4, 2.2]));
    if (this.flakyCI) {
      // A flaky run: it tails red once, and the retry passes.
      this.flakyCI = false;
      terminal.fail();
      await wait(stage, 0.9);
      terminal.state = 'tail';
      this.ciRetries++;
      await wait(stage, this.between([1.2, 1.8]));
    }
    terminal.pass();
    await wait(stage, 0.4);
    await this.mergeAt(repo.node);
    void hub.report(repo.tie, this.scm);
    signal.detach();
    lane.worktree.light = 'off';
    this.working.delete(drone);
  }

  /** Between check-in and CI: a story can have the change reviewed here (Rovo Dev). None by default. */
  protected async reviewed(_coder: Drone, _lane: CodeLane): Promise<void> {}

  /** The output (line, assembler, belt, portal), built the first time it's needed. */
  protected buildOutputLine(): Promise<OutputLine> {
    this.building ??= buildOutput(this.stage, this.map.code, () => this.shipped++).then((output) => (this.output = output));
    return this.building;
  }

  /** A squash merge at the repo, one at a time: the branch forks and folds back in, the trunk keeps the commit, and the deploy shoots down the line. */
  protected mergeAt(node: SystemNode): Promise<void> {
    const merge = this.merging.then(async () => {
      const { stage } = this;
      node.light = 'working';
      const job = new JobAnimation(node.kind as ScmKind, { ending: 'merge' });
      job.position.copy(node.position);
      job.rotation.y = FACE_CAMERA;
      job.scale.setScalar(JOB_SCALE);
      job.product.visible = false;
      stage.add(job);
      const untick = stage.onTick((dt) => {
        job.update(dt);
        job.product.visible = false;
      });
      node.emblem.visible = false;
      await tween(stage, 2, (t) => (job.progress = t));
      this.trunk.commit();
      untick();
      job.dispose();
      node.emblem.visible = true;
      node.light = 'off';
      // Deployed: small cubes, fast, down the output line.
      // A cube that finds the line full waits its turn (for a while; past that the deploy moves on).
      const output = await this.building;
      for (let sent = 0, tries = 0; output && sent < this.deployCubes && tries < 80; tries++) {
        if (output.commit()) sent++;
        await wait(stage, 0.12);
      }
    });
    this.merging = merge.catch(() => {});
    return merge;
  }

  /**
   * A copy at work on one step, hovering over the system's node. Where the
   * system has a job animation and the step makes something (write, update),
   * it plays in place of the emblem. Otherwise the copy's signal dots show the work.
   */
  protected async work(drone: Drone, node: SystemNode, step: Step): Promise<void> {
    const { stage } = this;
    this.working.set(drone, node);
    node.light = 'working';
    drone.flash = 1;
    const makes = step.action !== 'read' && step.action !== 'send';
    if (makes && hasJob(node.kind)) {
      const job = new JobAnimation(node.kind);
      job.position.copy(node.position);
      job.rotation.y = FACE_CAMERA;
      job.scale.setScalar(JOB_SCALE);
      stage.add(job);
      const untick = stage.onTick((dt) => job.update(dt));
      node.emblem.visible = false;
      await tween(stage, this.between(WORK) * JOB_STRETCH, (t) => (job.progress = t));
      await wait(stage, 0.2);
      untick();
      job.dispose();
      node.emblem.visible = true;
    } else {
      const signal = attachSignal(stage, drone, node);
      await wait(stage, this.between(WORK));
      signal.detach();
    }
    node.light = 'off';
    this.working.delete(drone);
  }

  /**
   * A read through Figma's MCP server: the copy goes to the spot beside Figma
   * and builds its MCP client out from itself: a terminal grows in under it, a
   * line draws to Figma (which comes up at its end if it isn't there). The
   * terminal tails the MCP calls while the design rides back along the line,
   * passes, and the read reports to Jira. Then the copy collapses it: the line
   * draws back, the terminal folds. One MCP session at a time.
   */
  protected mcpRead(drone: Drone, from: number): Promise<number> {
    const session = this.mcpSession.then(async () => {
      const { stage, hub } = this;
      const at = this.mcpAt as Vector3;
      await fly(stage, DroneFlight.to(drone, at, { speed: SUB_SPEED, fromHeight: from, lift: 0 }));
      const terminal = new Terminal({ state: 'admin', seed: this.tasks.length + 11 });
      terminal.position.copy(at);
      terminal.scale.setScalar(0.001);
      const figmaAt = this.places.figma as Vector3;
      const toward = figmaAt.clone().sub(at).normalize();
      const line = new Branch(
        new LineCurve3(at.clone().addScaledVector(toward, TERMINAL_SIZE / 2 + 0.06), figmaAt.clone().addScaledVector(toward, -(NODE_FOOTPRINT / 2 + 0.08))),
        NEUTRAL.packet,
      );
      line.drawn = 0;
      stage.add(terminal, line);
      const untick = stage.onTick((dt) => terminal.update(dt));
      this.working.set(drone, terminal);
      this.mcpTerminal = terminal;
      await tween(stage, 0.4, (t) => terminal.scale.setScalar(Math.max(0.001, easeOutBack(t))));
      await tween(stage, 0.5, (t) => (line.drawn = t));
      const figma = await this.systems.call('figma');
      terminal.state = 'tail';
      figma.node.light = 'working';
      await shoot(stage, reversed(line.curve), 5, undefined, 'figma');
      await wait(stage, this.between(WORK));
      terminal.pass();
      figma.node.light = 'off';
      void hub.report(figma.tie, 'figma');
      await wait(stage, 0.4);
      // Collapsed back into the copy: the line draws back, the terminal folds.
      await tween(stage, 0.4, (t) => (line.drawn = Math.max(0.001, 1 - t)));
      await tween(stage, 0.35, (t) => terminal.scale.setScalar(Math.max(0.001, 1 - t)));
      this.working.delete(drone);
      this.mcpTerminal = undefined;
      this.mcpReads++;
      untick();
      terminal.dispose();
      line.dispose();
      void this.systems.release('figma');
      return 0;
    });
    this.mcpSession = session.catch(() => 0);
    return session;
  }

  /** A copy of Rovo, born inside it, full size. */
  protected async emerge(): Promise<Copy> {
    const rovo = this.rovo.drone;
    const sub = spawnDrone(this.stage, rovo.position.x, rovo.position.z, {
      name: `Rovo.${++this.subs}`,
      lineage: 'cyan',
      subAgent: true,
      status: 'waiting',
    });
    sub.drone.position.y = AT_ROVOS_BODY;
    sub.drone.fade = 0;
    rovo.flash = 1;
    await tween(this.stage, EMERGE_SECONDS, (t) => (sub.drone.fade = t));
    return { sub, from: AT_ROVOS_BODY };
  }

  /**
   * Rovo hands `copy` the next card off the board as a Jira issue
   * (`request`), and the copy runs `task` (in coding lane `lane`, or -1),
   * shoots the finished card back to Rovo, and waits where it is.
   */
  protected async handOver(copy: Copy, task: Task, lane: number, request: Request): Promise<void> {
    const rovo = this.rovo.drone;
    const { drone } = copy.sub;
    rovo.flash = 1;
    const card = await this.hub.takeTask(drone.rig.hover, rovo.rig.hover, request);
    if (!card) return;
    drone.status = 'working';
    const held: { card: Ticket; run?: TaskRun } = { card };
    this.copies.set(drone, held);
    copy.from = await this.runTask(copy.sub, task, card, lane, copy.from, (run) => (held.run = run));
    this.copies.set(drone, {});
    drone.status = 'waiting';
  }

  /** The work is done: the copy flies home into Rovo and fades into it. */
  protected async home(copy: Copy, delay: number): Promise<void> {
    const { stage } = this;
    const rovo = this.rovo.drone;
    const { drone } = copy.sub;
    await wait(stage, delay);
    await fly(stage, DroneFlight.to(drone, rovo.position, { speed: SUB_SPEED, fromHeight: copy.from, toHeight: AT_ROVOS_BODY, lift: 0 }));
    await tween(stage, 0.3, (t) => (drone.fade = 1 - t));
    this.copies.delete(drone);
    copy.sub.despawn();
    rovo.flash = 1;
  }

  /** The user's terminal, brought up the first time a copy reports back: it comes up under the copy, then its line reaches in to Jira. It stays. */
  protected userTerminal(): Promise<Terminal> {
    this.terminalUp ??= (async () => {
      const { stage } = this;
      const terminal = new Terminal({ state: 'admin', seed: 7 });
      terminal.position.copy(this.map.userTerminal);
      terminal.scale.setScalar(0.001);
      stage.add(terminal);
      stage.onTick((dt) => terminal.update(dt));
      await tween(stage, 0.4, (t) => terminal.scale.setScalar(Math.max(0.001, easeOutBack(t))));
      await this.hub.tie('user-terminal', this.map.userTerminal, undefined, TERMINAL_SIZE / 2 + 0.1, true);
      this.terminal = terminal;
      return terminal;
    })();
    return this.terminalUp;
  }

  protected between([lo, hi]: [number, number]): number {
    return lo + this.random() * (hi - lo);
  }
}

/** Each linked system's laid-out line into the system it hangs off, oriented from it. */
function viaRoutes(map: StoryMap, via: Partial<Record<SystemKind, SystemKind>>): Partial<Record<SystemKind, Vector3[]>> {
  const out: Partial<Record<SystemKind, Vector3[]>> = {};
  for (const [kind, parent] of Object.entries(via) as [SystemKind, SystemKind][]) {
    const link = map.links.find((l) => (l.a === kind && l.b === parent) || (l.a === parent && l.b === kind));
    const at = map.places[kind];
    if (!link || !at) continue;
    out[kind] = link.line[0].distanceTo(at) < 1e-6 ? link.line : [...link.line].reverse();
  }
  return out;
}

function easeOutBack(t: number): number {
  const c = 1.6;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}
