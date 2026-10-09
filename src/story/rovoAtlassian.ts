import { LineCurve3, Vector3 } from 'three';
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
import { Job as JobAnimation } from '../primitives/job/Job';
import { hasJob, type SystemKind } from '../primitives/node/emblems';
import { SystemNode } from '../primitives/node/SystemNode';
import { attachSignal } from '../stage/attachSignal';
import { type SpawnedDrone, spawnDrone } from '../stage/spawnDrone';
import type { SceneHost } from '../stage/Stage';
import { accessCheck } from './accessCheck';
import { shoot } from './beam';
import { JiraHub, PLATE } from './jiraHub';
import { fly, tween, wait } from './timeline';

/** Rovo's gate sits at the origin: Rovo, the first thing on the grid, is dead center. */
export const ROVO_GATE = new Vector3(0, 0, 0);
/** Where Rovo first shows up, alone on the grid, before it flies over to its gate. */
export const ROVO_START = new Vector3(3.5, 0, 3.5);
/** Jira, the quarterback, a short hop left of the gate, level with it on screen: never behind Rovo as it hovers on the gate. */
export const JIRA_AT = new Vector3(-3, 0, 3);
/** Toolsets go up in slots on a ring around Jira, clear of the gate and of Rovo hovering over Jira. */
const SLOT_RADIUS = 5;
export const SLOTS: readonly Vector3[] = [0, 1, 2, 3, 4, 5, 6, 7]
  .map((i) => {
    const a = (i / 8) * Math.PI * 2;
    return JIRA_AT.clone().add(new Vector3(Math.cos(a) * SLOT_RADIUS, 0, Math.sin(a) * SLOT_RADIUS)).round();
  })
  .filter((p) => p.distanceTo(ROVO_GATE) > 3.5 && !behindOnScreen(p, JIRA_AT));

/** Straight up the screen from `from` (camera looks along -x, -z): where an agent hovering over `from` would cover it. */
function behindOnScreen(p: Vector3, from: Vector3): boolean {
  const dx = p.x - from.x;
  const dz = p.z - from.z;
  return dx + dz < 0 && Math.abs(dx - dz) < 3;
}

/** What a task needs, picked per task: a code tool, a docs tool, and sometimes a third. Every toolset is a little different. */
export const CODE_TOOLS: readonly SystemKind[] = ['bitbucket', 'github'];
export const DOC_TOOLS: readonly SystemKind[] = ['confluence', 'gdocs'];
export const EXTRA_TOOLS: readonly SystemKind[] = ['figma', 'codesearch'];
/** How far a toolset's tools stand out from its spot, each straight along the grid from it. */
const TOOL_OUT = 1.5;
/** The four ways out of a spot along the grid. */
const GRID_WAYS = [new Vector3(1, 0, 0), new Vector3(-1, 0, 0), new Vector3(0, 0, 1), new Vector3(0, 0, -1)];
const TOOL_SCALE = 0.85;

const WORK: [number, number] = [1.1, 1.9];
/** A job animation takes a little longer than plain work, so it reads. */
const JOB_STRETCH = 1.6;
const TASK_GAP: [number, number] = [1.6, 3.4];
const SUB_SPEED = 4;
/** Seconds a sub-agent takes to fade into being inside Rovo before it flies out. */
const EMERGE_SECONDS = 0.25;
/** How high the padlock floats over the gate once Rovo is through. */
const LOCK_HEIGHT = 0.9;

/** How high a sub-agent's floor anchor sits for its body to be level with Rovo's body. */
const AT_ROVOS_BODY = HOVER_HEIGHT * (1 - SUB_AGENT_SCALE);

/** One sub-agent's job: its task, where it set up, and the tools it spun up for it. */
export interface Job {
  id: string;
  spot: Vector3;
  kinds: SystemKind[];
}

/**
 * Rovo and Jira, the quarterback (Story Narrative). Rovo floats in dead
 * center on its gate and authenticates (yellow, then green), then moves into
 * Jira and works from there (the gate locks behind it: a padlock snaps shut
 * over it). Jira is the system of record for everything.
 *
 * Tasks keep coming onto Jira's board. One to three sub-agents at a time
 * (seeded) spawn out of Rovo, each takes a task and flies out to an open spot
 * on the grid, where it spins up its own tools for that task: a code tool
 * (Bitbucket or GitHub), a docs tool (Confluence or Google Docs), and
 * sometimes a third (Figma or Code search), so every toolset is a little
 * different. A Graph Line ties the toolset back to Jira; the work on each
 * tool rides it home, the task comes back done, the toolset folds away, and
 * the sub-agent flies home into Rovo.
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
  /** Every job started, in order. */
  readonly jobs: Job[] = [];
  /** Toolsets up right now, by job id. */
  readonly toolsets = new Map<string, SystemNode[]>();
  /** Lines from sub-agents' spots out to their tools, up right now. */
  spokes = 0;
  /** Rovo is in Jira (after authenticating). */
  inJira = false;
  out = 0;
  peakOut = 0;
  private readonly random: () => number;
  private readonly freeSlots: Vector3[] = SLOTS.map((s) => s.clone());
  private running = false;
  private subs = 0;

  constructor(
    private readonly stage: SceneHost,
    seed = 3,
  ) {
    this.random = seededRandom(seed);
    this.crew = 1 + Math.floor(this.random() * 3);
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
    this.hub = new JiraHub(stage, this.jira, () => [ROVO_GATE, ...[...this.toolsets.values()].flat().map((n) => n.position)], this.random);
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
    // Access granted: Jira comes up.
    await hub.appear();
    await wait(stage, 0.3);
    // In through the gate, along its line, and into Jira: that's where Rovo works from.
    await tween(stage, 0.7, (t) => (this.accessLine.drawn = t));
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
      if (this.out < this.crew && hub.board.length > 0 && this.freeSlots.length > 0) void this.runJob();
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
   * One sub-agent, one task: out of Rovo, take the task, fly to an open spot,
   * spin up its own tools there, tie them to Jira, work each tool (its work
   * rides the tie home), bring the task back done, fold the tools away, and
   * fly home into Rovo.
   */
  private async runJob(): Promise<void> {
    const { stage, hub } = this;
    const rovo = this.rovo.drone;
    const slot = this.freeSlots.splice(Math.floor(this.random() * this.freeSlots.length), 1)[0];
    const kinds = [this.pick(CODE_TOOLS), this.pick(DOC_TOOLS), ...(this.random() < 0.5 ? [this.pick(EXTRA_TOOLS)] : [])];
    const job: Job = { id: `job-${this.jobs.length + 1}`, spot: slot.clone(), kinds };
    this.jobs.push(job);
    this.out++;
    this.peakOut = Math.max(this.peakOut, this.out);

    // Born inside Rovo, full size; it takes a task off Jira's board on its way out.
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
    const task = await hub.takeTask(sub.drone.rig.hover);
    await fly(stage, DroneFlight.to(sub.drone, slot, { speed: SUB_SPEED, fromHeight: AT_ROVOS_BODY, lift: 0 }));

    // It spins up its own tools for this task, each out along the grid from its spot, and ties them back to
    // Jira. The tie comes in on the side facing Jira; the tools take the other three.
    const toJira = JIRA_AT.clone().sub(slot);
    const tieSide = Math.abs(toJira.x) >= Math.abs(toJira.z) ? new Vector3(Math.sign(toJira.x), 0, 0) : new Vector3(0, 0, Math.sign(toJira.z));
    const ways = GRID_WAYS.filter((w) => w.dot(tieSide) < 0.5);
    const spokes: Branch[] = [];
    const tools = kinds.map((kind, i) => {
      const node = new SystemNode({ kind });
      node.position.copy(slot).addScaledVector(ways[i], TOOL_OUT);
      const spoke = new Branch(
        new LineCurve3(slot.clone().addScaledVector(ways[i], 0.2), node.position.clone().addScaledVector(ways[i], -(TOOL_SCALE * NODE_FOOTPRINT) / 2 - 0.05)),
        NEUTRAL.packet,
      );
      stage.add(spoke);
      spokes.push(spoke);
      this.spokes++;
      // Its name grows in and folds away with it, so it never floats over empty floor.
      node.scale.setScalar(0.001);
      node.labelOpacity = 0;
      stage.add(node);
      return node;
    });
    this.toolsets.set(job.id, tools);
    // Each line draws out along the grid, then its tool grows in at the end of it.
    for (const [i, node] of tools.entries()) {
      await tween(stage, 0.25, (t) => (spokes[i].drawn = t));
      await tween(stage, 0.3, (t) => {
        node.scale.setScalar(Math.max(0.001, TOOL_SCALE * easeOutBack(t)));
        node.labelOpacity = t;
      });
    }
    await hub.tie(job.id, slot, tieSide);

    // Work each tool in turn; what it makes comes to the spot and rides the tie home into Jira.
    for (const node of tools) {
      node.light = 'working';
      sub.drone.flash = 1;
      await this.work(node);
      await shoot(stage, reversed(spokes[tools.indexOf(node)].curve), 4, undefined, node.kind);
      await hub.report(job.id, node.kind);
      node.light = 'off';
    }

    // The task goes home done; the tools fold away; the sub-agent flies home into Rovo.
    if (task) await hub.finish(task);
    void hub.untie(job.id);
    await Promise.all(
      tools.map((node, i) =>
        tween(stage, 0.4, (t) => {
          node.scale.setScalar(Math.max(0.001, TOOL_SCALE * (1 - t)));
          node.labelOpacity = 1 - t;
          spokes[i].drawn = Math.max(0.001, 1 - t);
        }),
      ),
    );
    for (const node of tools) node.dispose();
    for (const spoke of spokes) spoke.dispose();
    this.spokes -= spokes.length;
    this.toolsets.delete(job.id);
    await fly(stage, DroneFlight.to(sub.drone, rovo.position, { speed: SUB_SPEED, toHeight: AT_ROVOS_BODY, lift: 0 }));
    await tween(stage, 0.3, (t) => (sub.drone.fade = 1 - t));
    sub.despawn();
    rovo.flash = 1;
    this.freeSlots.push(slot);
    this.out--;
  }

  /** A tool at work: where the system has a job animation (GitHub and Bitbucket grow a branch, Figma draws), it plays in place of the emblem. */
  private async work(node: SystemNode): Promise<void> {
    const { stage } = this;
    if (!hasJob(node.kind)) return wait(stage, this.between(WORK));
    const job = new JobAnimation(node.kind);
    job.position.copy(node.position);
    job.rotation.y = FACE_CAMERA;
    job.scale.setScalar(TOOL_SCALE);
    stage.add(job);
    const untick = stage.onTick((dt) => job.update(dt));
    node.emblem.visible = false;
    await tween(stage, this.between(WORK) * JOB_STRETCH, (t) => (job.progress = t));
    await wait(stage, 0.2);
    untick();
    job.dispose();
    node.emblem.visible = true;
  }

  private pick<T>(from: readonly T[]): T {
    return from[Math.floor(this.random() * from.length)];
  }

  private between([lo, hi]: [number, number]): number {
    return lo + this.random() * (hi - lo);
  }
}

function easeOutBack(t: number): number {
  const c = 1.6;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}
