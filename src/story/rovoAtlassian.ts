import { Vector3 } from 'three';
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
import { hasJob, isScm, SCM_KINDS, type ScmKind, type SystemKind } from '../primitives/node/emblems';
import { NODE_SCALE, SystemNode } from '../primitives/node/SystemNode';
import { PAD_TOP } from '../primitives/pad/Pad';
import { attachSignal } from '../stage/attachSignal';
import { type SpawnedDrone, spawnDrone } from '../stage/spawnDrone';
import type { SceneHost } from '../stage/Stage';
import { accessCheck } from './accessCheck';
import { JiraHub, PLATE } from './jiraHub';
import { makeTask, type Step, type Task } from './rovoTasks';
import { SystemsOnGrid } from './rovoSystems';
import { fly, tween, wait } from './timeline';

/** Rovo's gate sits at the origin: Rovo, the first thing on the grid, is dead center. */
export const ROVO_GATE = new Vector3(0, 0, 0);
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
  notion: new Vector3(0, 0, 7),
  github: new Vector3(4, 0, -4),
  bitbucket: new Vector3(4, 0, -4),
  gitlab: new Vector3(4, 0, -4),
};

const WORK: [number, number] = [1.1, 1.9];
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
  /** How many sub-agents Rovo runs at once this run (1–3). */
  readonly crew: number;
  /** Every task started, in order. */
  readonly tasks: TaskRun[] = [];
  /** The systems on the grid. */
  readonly systems: SystemsOnGrid;
  /** This run's source code manager: every code task goes to the same repo. */
  readonly scm: ScmKind;
  /** The repo's trunk at the SCM: one commit per merge (its final state). */
  readonly trunk = new RepoTrunk();
  /** Copies at work right now, and the node each is working (always over it). */
  readonly working = new Map<Drone, SystemNode>();
  /** Rovo is in Jira (after authenticating). */
  inJira = false;
  out = 0;
  peakOut = 0;
  private readonly random: () => number;
  private running = false;
  private subs = 0;

  constructor(
    private readonly stage: SceneHost,
    seed = 3,
  ) {
    this.random = seededRandom(seed);
    this.crew = 1 + Math.floor(this.random() * 3);
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
    this.hub = new JiraHub(stage, this.jira, () => [ROVO_GATE, ...this.systems.positions()], this.random);
    this.systems = new SystemsOnGrid(stage, this.hub, PLACES);
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
      if (this.out < this.crew && hub.board.length > 0) void this.runTask();
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
  private async runTask(): Promise<void> {
    const { stage, hub } = this;
    const rovo = this.rovo.drone;
    const run: TaskRun = {
      id: `task-${this.tasks.length + 1}`,
      task: makeTask(this.random, { scm: this.scm, without: ['slack'] }),
      done: 0,
    };
    this.tasks.push(run);
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
    for (const step of run.task.steps) {
      const system = await this.systems.call(step.system);
      await fly(stage, DroneFlight.to(sub.drone, system.node.position, { speed: SUB_SPEED, fromHeight: from, lift: 0 }));
      from = 0;
      await this.work(sub.drone, system.node, step);
      // The step reports to Jira along the system's Graph Line.
      if (step.system !== 'jira') void hub.report(system.tie, step.system);
      run.done++;
    }

    // The task is done: the card goes home to Done, the copy flies home into Rovo.
    if (card) await hub.finish(card);
    await fly(stage, DroneFlight.to(sub.drone, rovo.position, { speed: SUB_SPEED, fromHeight: from, toHeight: AT_ROVOS_BODY, lift: 0 }));
    await tween(stage, 0.3, (t) => (sub.drone.fade = 1 - t));
    sub.despawn();
    rovo.flash = 1;
    this.out--;
    // Third-party tools this task called go, unless another open task still needs them.
    for (const step of run.task.steps) void this.systems.release(step.system);
  }

  /**
   * A copy at work on one step, hovering over the system's node. Where the
   * system has a job animation and the step makes something (write, update,
   * code), it plays in place of the emblem: code is squash-merged and the
   * repo's trunk keeps the commit. Otherwise the copy's signal dots show the work.
   */
  private async work(drone: Drone, node: SystemNode, step: Step): Promise<void> {
    const { stage } = this;
    this.working.set(drone, node);
    node.light = 'working';
    drone.flash = 1;
    const makes = step.action !== 'read' && step.action !== 'send';
    if (makes && hasJob(node.kind)) {
      const scm = isScm(node.kind);
      const job = new JobAnimation(node.kind, { ending: scm ? 'merge' : 'init' });
      job.position.copy(node.position);
      job.rotation.y = FACE_CAMERA;
      job.scale.setScalar(JOB_SCALE);
      stage.add(job);
      const untick = stage.onTick((dt) => job.update(dt));
      node.emblem.visible = false;
      await tween(stage, this.between(WORK) * JOB_STRETCH, (t) => (job.progress = t));
      if (job.merged) this.trunk.commit();
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

  private between([lo, hi]: [number, number]): number {
    return lo + this.random() * (hi - lo);
  }
}

function easeOutBack(t: number): number {
  const c = 1.6;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}
