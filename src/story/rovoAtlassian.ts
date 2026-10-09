import { type Object3D, Vector3 } from 'three';
import { DroneFlight } from '../animation/DroneFlight';
import { GateAnimator } from '../animation/GateAnimator';
import { BEND_RADIUS, FACE_CAMERA, GATE_FOOTPRINT } from '../core/grid';
import { NEUTRAL } from '../core/palette';
import { seededRandom } from '../core/scatter';
import { Branch } from '../primitives/branch/Branch';
import { roundedPath, trimPolyline } from '../primitives/branch/gridPath';
import { HOVER_HEIGHT, SUB_AGENT_SCALE } from '../primitives/drone/Drone';
import { Gate } from '../primitives/gate/Gate';
import { Padlock } from '../primitives/gate/Padlock';
import type { Drone } from '../primitives/drone/Drone';
import { Job as JobAnimation } from '../primitives/job/Job';
import { RepoTrunk } from '../primitives/job/RepoTrunk';
import { hasJob, SCM_KINDS, type ScmKind, type SystemKind } from '../primitives/node/emblems';
import { NODE_SCALE, SystemNode } from '../primitives/node/SystemNode';
import { PAD_TOP } from '../primitives/pad/Pad';
import { TERMINAL_SIZE, Terminal } from '../primitives/terminal/Terminal';
import { attachSignal } from '../stage/attachSignal';
import { type SpawnedDrone, spawnDrone } from '../stage/spawnDrone';
import type { SceneHost } from '../stage/Stage';
import { accessCheck } from './accessCheck';
import { JiraHub, PLATE } from './jiraHub';
import { makeTask, type Step, type Task } from './rovoTasks';
import { type PlacedSystem, SystemsOnGrid } from './rovoSystems';
import { ASSEMBLER_AT, buildOutput, CodeLane, PORTAL_AT, SCM_AT, SCM_TIE_SIDE } from './rovoCode';
import type { OutputLine } from './shipOutput';
import { SLACK_AT, SlackHub } from './rovoSlack';
import { fly, tween, wait } from './timeline';

/** Rovo's gate sits at the origin: Rovo, the first thing on the grid, is dead center. */
export const ROVO_GATE = new Vector3(0, 0, 0);
/** The middle of everything on the grid, from the mini systems left of Jira to the portal on the right. */
export const STORY_CENTER = new Vector3(0.9, 0.6, -1.4);
/** The user's terminal: where a copy updates the user, just below Jira, clear of Slack's line and the gate. */
export const USER_TERMINAL_AT = new Vector3(-1, 0, 6);
/** Where Rovo first shows up, alone on the grid, before it flies over to its gate. */
export const ROVO_START = new Vector3(3.5, 0, 3.5);
/** Jira, the quarterback, a short hop left of the gate, level with it on screen: never behind Rovo as it hovers on the gate. */
export const JIRA_AT = new Vector3(-3, 0, 3);
/**
 * Where each system stands when a task first calls it. Mini systems (docs,
 * reading, design) gather around Jira on the left; the code side is on the
 * open right past the gate. Every place is on the grid and clear of Rovo
 * hovering over Jira.
 */
export const PLACES: Partial<Record<SystemKind, Vector3>> = {
  confluence: new Vector3(-7, 0, 3),
  codesearch: new Vector3(-3, 0, 7),
  figma: new Vector3(-7, 0, 7),
  gdocs: new Vector3(-7, 0, -1),
  notion: new Vector3(1, 0, 8),
  github: SCM_AT,
  bitbucket: SCM_AT,
  gitlab: SCM_AT,
};

const WORK: [number, number] = [1.1, 1.9];
/** Little cubes a deploy sends down the output line: two merges fill the assembler's 2 × 2 × 2. */
const DEPLOY_CUBES = 4;
/** A job animation takes a little longer than plain work, so it reads. */
const JOB_STRETCH = 1.6;
/** A job animation stands bigger than its tool's emblem, so it reads at this zoom. */
const JOB_SCALE = 1.4;
const TASK_GAP: [number, number] = [1.6, 3.4];
const SUB_SPEED = 4;
/** Seconds a sub-agent takes to fade into being inside Rovo before it flies out. */
const EMERGE_SECONDS = 0.25;
/** How high the padlock floats over the gate once Rovo is through. */
const LOCK_HEIGHT = 0.9;

/** How high a sub-agent's floor anchor sits for its body to be level with Rovo's body. */
const AT_ROVOS_BODY = HOVER_HEIGHT * (1 - SUB_AGENT_SCALE);

/** One Jira task, run by one copy of Rovo. */
export interface TaskRun {
  id: string;
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
  /** How many copies Rovo runs at once this run: coding (1–3, one per lane) and in mini systems (1–3). */
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
  /** This run's source code manager: every code task goes to the same repo. */
  readonly scm: ScmKind;
  /** The repo's trunk at the SCM: one commit per merge (its final state). */
  readonly trunk = new RepoTrunk();
  /** Copies at work right now, and the node each is working (always over it). */
  readonly working = new Map<Drone, Object3D>();
  /** Slack, the comms hub behind its gateway (up once a copy first sends a message). */
  readonly slack: SlackHub;
  /** The user's terminal, where a copy reports back (once a task first needs it). */
  terminal?: Terminal;
  /** Times a copy has updated the user's terminal. */
  userReports = 0;
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
  /** The next task, waiting for a copy (or a free lane) to take it. */
  private next?: Task;
  private building?: Promise<OutputLine>;
  /** Merges at the repo happen one at a time. */
  private merging: Promise<void> = Promise.resolve();
  private readonly random: () => number;
  private running = false;
  private subs = 0;

  constructor(
    private readonly stage: SceneHost,
    seed = 3,
  ) {
    this.random = seededRandom(seed);
    this.codeCrew = 1 + Math.floor(this.random() * 3);
    this.loopCrew = 1 + Math.floor(this.random() * 3);
    this.scm = SCM_KINDS[Math.floor(this.random() * SCM_KINDS.length)];
    this.gate.position.copy(ROVO_GATE);
    const animator = new GateAnimator(this.gate);
    stage.onTick((dt) => animator.update(dt));
    stage.add(this.gate);
    this.lock.position.copy(ROVO_GATE).setY(LOCK_HEIGHT);
    this.lock.shown = 0;
    this.lock.shut = 0;
    stage.add(this.lock);
    this.jira = new SystemNode({ kind: 'jira' });
    this.jira.position.copy(JIRA_AT);
    stage.add(this.jira);
    this.hub = new JiraHub(
      stage,
      this.jira,
      () => [
        ROVO_GATE,
        ...this.systems.positions(),
        ...this.lanes.flatMap((l) => l?.positions() ?? []),
        ASSEMBLER_AT,
        PORTAL_AT,
        SLACK_AT,
        this.slack.gateway.center,
        USER_TERMINAL_AT,
      ],
      this.random,
    );
    this.slack = new SlackHub(stage, new Vector3(JIRA_AT.x, 0, JIRA_AT.z - PLATE / 2 - 0.05), this.random);
    this.systems = new SystemsOnGrid(stage, this.hub, PLACES, { github: SCM_TIE_SIDE, bitbucket: SCM_TIE_SIDE, gitlab: SCM_TIE_SIDE });
    // The repo's trunk stands on the SCM node's slab, at its right-hand corner, and is only there while the SCM is:
    // a third-party SCM goes when its tasks are done and takes its trunk with it (it keeps its commits for next time).
    const repo = PLACES[this.scm] as Vector3;
    this.trunk.position.set(repo.x + 0.3, PAD_TOP * NODE_SCALE, repo.z - 0.3);
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
    // Along the grid, never diagonal: out of the gate toward the camera, round one corner, and into Jira's plate.
    const corner = new Vector3(ROVO_GATE.x, 0, JIRA_AT.z);
    this.accessLine = new Branch(
      roundedPath(trimPolyline([ROVO_GATE.clone(), corner, JIRA_AT.clone()], GATE_FOOTPRINT / 2 + 0.05, PLATE / 2 + 0.05), BEND_RADIUS),
      NEUTRAL.packet,
    );
    stage.add(this.accessLine);
    // Progressive: at first there's only Rovo. The gate, Jira and its board each come in when the story gets to them.
    this.accessLine.drawn = 0;
    this.gate.visible = false;
    this.gate.scale.setScalar(0.001);
    this.hub.hide();
    this.rovo = spawnDrone(stage, ROVO_START.x, ROVO_START.z, { name: 'Rovo', lineage: 'cyan', showLabel: true, status: 'waiting' });
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
    const { stage, hub } = this;
    const rovo = this.rovo.drone;
    this.running = true;
    await tween(stage, 0.8, (t) => (rovo.fade = t));
    await wait(stage, 0.6);
    const toGate = fly(stage, DroneFlight.to(rovo, ROVO_GATE, { speed: 3 }));
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
    const flight = fly(stage, DroneFlight.to(rovo, JIRA_AT, { speed: 3 }));
    // Once Rovo is away from the gate, it locks behind it.
    await wait(stage, 0.7);
    await this.lockGate();
    await flight;
    this.inJira = true;
    this.jira.light = 'working';
    await wait(stage, 0.6);
    // Work starts: the kanban board shows up.
    await hub.showBoard();
    for (let i = 0; i < 3; i++) await hub.addTask();
    void this.taskFeed();
    while (this.running) {
      if (hub.board.length > 0) {
        const task = (this.next ??= makeTask(this.random, { scm: this.scm }));
        const code = task.type === 'code';
        const lane = this.lanes.indexOf(null);
        if (code ? this.codeOut < this.codeCrew && lane >= 0 : this.out - this.codeOut < this.loopCrew) {
          this.next = undefined;
          void this.runTask(task, code ? lane : -1);
        }
      }
      await wait(stage, 0.6);
    }
  }

  /** A padlock fades in open over the gate, then snaps shut. The gate stays lit under it: security is on, not off. */
  private async lockGate(): Promise<void> {
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
   * One task, one copy of Rovo: out of Rovo with the card, then each step in
   * turn (fly to the system, work it while hovering over it, report to Jira),
   * then the card goes to Done, the copy flies home into Rovo, and the
   * systems only this task needed go.
   */
  private async runTask(task: Task, laneIndex: number): Promise<void> {
    const { stage, hub } = this;
    const rovo = this.rovo.drone;
    const run: TaskRun = { id: `task-${this.tasks.length + 1}`, task, done: 0 };
    this.tasks.push(run);
    const lane = laneIndex >= 0 ? new CodeLane(stage, laneIndex, this.tasks.length) : undefined;
    if (lane) {
      this.lanes[laneIndex] = lane;
      this.codeOut++;
    }
    this.out++;
    this.peakOut = Math.max(this.peakOut, this.out);

    // Born inside Rovo, full size; it takes the card off Jira's board on its way out.
    const sub = spawnDrone(stage, rovo.position.x, rovo.position.z, {
      name: `Rovo.${++this.subs}`,
      lineage: 'cyan',
      subAgent: true,
      status: 'working',
    });
    sub.drone.position.y = AT_ROVOS_BODY;
    sub.drone.fade = 0;
    rovo.flash = 1;
    await tween(stage, EMERGE_SECONDS, (t) => (sub.drone.fade = t));
    const card = await hub.takeTask(sub.drone.rig.hover);

    let from = AT_ROVOS_BODY;
    if (lane) {
      await this.code(sub.drone, lane, from);
      run.done = run.task.steps.length;
      from = 0;
    }
    for (const step of lane ? [] : run.task.steps) {
      if (step.system === 'slack') {
        // Slack stands on its own behind its gateway: the copy goes there, Slack comes up for it the first time,
        // and its message goes out through the gateway into Jira's record.
        await fly(stage, DroneFlight.to(sub.drone, SLACK_AT, { speed: SUB_SPEED, fromHeight: from, lift: 0 }));
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
      const at = step.system === 'jira' ? JIRA_AT : (this.systems.placed.get(step.system)?.node.position ?? (PLACES[step.system] as Vector3));
      await fly(stage, DroneFlight.to(sub.drone, at, { speed: SUB_SPEED, fromHeight: from, lift: 0 }));
      from = 0;
      const system = await this.systems.call(step.system);
      await this.work(sub.drone, system.node, step);
      if (step.system !== 'jira') {
        // A write stays where it was written (write-back); a read brings what it found home to Jira;
        // either way the step's status rides the system's Graph Line to Jira.
        if (step.action === 'read') void hub.report(system.tie, step.system);
        else {
          this.systems.writeBack(step.system);
          void hub.report(system.tie);
        }
      }
      run.done++;
    }
    if (run.task.reportToUser) {
      // Last, the copy updates the terminal back to the user.
      await fly(stage, DroneFlight.to(sub.drone, USER_TERMINAL_AT, { speed: SUB_SPEED, fromHeight: from, lift: 0 }));
      from = 0;
      const terminal = await this.userTerminal();
      this.working.set(sub.drone, terminal);
      terminal.state = 'tail';
      await wait(stage, this.between(WORK));
      terminal.pass();
      await wait(stage, 0.5);
      terminal.state = 'admin';
      this.working.delete(sub.drone);
      this.userReports++;
    }

    // The task is done: the card goes home to Done, the copy flies home into Rovo.
    // A coding copy collapses its lane back into itself before it goes.
    if (lane) await lane.collapse();
    if (card) {
      await hub.finish(card, rovo.rig.hover);
      rovo.flash = 1;
    }
    await fly(stage, DroneFlight.to(sub.drone, rovo.position, { speed: SUB_SPEED, fromHeight: from, toHeight: AT_ROVOS_BODY, lift: 0 }));
    await tween(stage, 0.3, (t) => (sub.drone.fade = 1 - t));
    sub.despawn();
    rovo.flash = 1;
    if (lane) {
      lane.dispose();
      this.lanes[lane.index] = null;
      this.codeOut--;
    }
    this.out--;
    // Third-party tools this task called go, unless another open task still needs them.
    for (const step of run.task.steps) void this.systems.release(step.system);
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
  private async code(drone: Drone, lane: CodeLane, from: number): Promise<void> {
    const { stage, hub } = this;
    // The copy goes out to its lane's spot and builds the lane out from itself, into the repo.
    await fly(stage, DroneFlight.to(drone, lane.spot, { speed: SUB_SPEED, fromHeight: from, lift: 0 }));
    this.working.set(drone, lane.worktree);
    let repo!: PlacedSystem;
    await lane.build(async () => (repo = await this.systems.call(this.scm)));
    this.building ??= buildOutput(stage).then((output) => (this.output = output));
    lane.worktree.light = 'working';
    const signal = attachSignal(stage, drone, lane.worktree);
    const { terminal } = lane;
    terminal.state = 'admin';
    await wait(stage, this.between([1, 1.6]));
    terminal.state = 'diff';
    await wait(stage, this.between([2.2, 3.2]));
    await lane.checkIn(this.scm);
    terminal.state = 'tail';
    await wait(stage, this.between([1.4, 2.2]));
    terminal.pass();
    await wait(stage, 0.4);
    await this.mergeAt(repo.node);
    void hub.report(repo.tie, this.scm);
    signal.detach();
    lane.worktree.light = 'off';
    this.working.delete(drone);
  }

  /** A squash merge at the repo, one at a time: the branch forks and folds back in, the trunk keeps the commit, and the deploy shoots down the line. */
  private mergeAt(node: SystemNode): Promise<void> {
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
      const output = await this.building;
      for (let i = 0; i < DEPLOY_CUBES; i++) {
        output?.commit();
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
  private async work(drone: Drone, node: SystemNode, step: Step): Promise<void> {
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

  /** The user's terminal, brought up the first time a copy reports back: it comes up under the copy, then its line reaches in to Jira. It stays. */
  private userTerminal(): Promise<Terminal> {
    this.terminalUp ??= (async () => {
      const { stage } = this;
      const terminal = new Terminal({ state: 'admin', seed: 7 });
      terminal.position.copy(USER_TERMINAL_AT);
      terminal.scale.setScalar(0.001);
      stage.add(terminal);
      stage.onTick((dt) => terminal.update(dt));
      await tween(stage, 0.4, (t) => terminal.scale.setScalar(Math.max(0.001, easeOutBack(t))));
      await this.hub.tie('user-terminal', USER_TERMINAL_AT, undefined, TERMINAL_SIZE / 2 + 0.1, true);
      this.terminal = terminal;
      return terminal;
    })();
    return this.terminalUp;
  }

  private between([lo, hi]: [number, number]): number {
    return lo + this.random() * (hi - lo);
  }
}

function easeOutBack(t: number): number {
  const c = 1.6;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}
