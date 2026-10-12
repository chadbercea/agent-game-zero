import { Vector3 } from 'three';
import { DroneFlight } from '../animation/DroneFlight';
import { Cloud } from '../primitives/cloud/Cloud';
import type { Drone } from '../primitives/drone/Drone';
import { type Request, Ticket } from '../primitives/ticket/Ticket';
import { attachSignal } from '../stage/attachSignal';
import type { SceneHost } from '../stage/Stage';
import { cloudDrop, groupOffsets } from './cloudDrop';
import { CODE_TITLE, type DevDay, type DevIssue, rollDevDay } from './devDay';
import { type Copy, RovoAtlassian, SUB_SPEED, type TaskRun } from './rovoAtlassian';
import type { CodeLane } from './rovoCode';
import type { Task } from './rovoTasks';
import { fly, tween, until, wait } from './timeline';

/**
 * The story's beats, in order: the developer's jobs to be done. Understand
 * the issue and the code; write the change; get it reviewed; get it green
 * and shipped; keep the docs current.
 */
export const DEV_BEATS = ['filed', 'arriving', 'notify', 'kickoff', 'understand', 'build', 'review', 'ship', 'document', 'done'] as const;
export type DevBeat = (typeof DEV_BEATS)[number];

/** How high the clouds float as they bring the team's issues in. */
const CLOUD_HEIGHT = 4.6;
/** Seconds between one group of clouds and the next. */
const CLOUD_GAP = 2.6;
/** How far apart the filed tickets wait, across the screen. */
const TICKET_SPACING = 0.9;
/** How big a falling card is (world size). */
const DROPPED_SCALE = 0.38;
/** How long a reviewer reads the diff. */
const REVIEW: [number, number] = [1.6, 2.4];
/** How long the coder takes to address review comments. */
const REWORK: [number, number] = [1.6, 2.4];

const CODE: Task = { type: 'code', steps: [{ system: 'bitbucket', action: 'code' }] };
/** Reviewing a change: reading its diff, at its lane's terminal. */
const REVIEW_TASK: Task = { type: 'read', steps: [{ system: 'bitbucket', action: 'read' }] };
const NOTES: Task = { type: 'doc', reportToUser: true, steps: [{ system: 'confluence', action: 'write' }] };
const POST: Task = { type: 'slack', steps: [{ system: 'slack', action: 'send' }] };

/**
 * Rovo Dev (Story Narrative): a developer's day, told as the developer's jobs
 * to be done, built from the same pieces as the other stories and by the
 * same rules (docs/rovo-mental-model.md).
 *
 * 1. Filed: before anything is up, the team files its tickets. Clouds (the
 *    humans in the loop) float over where Jira's board will stand, one group
 *    per ticket, and each drops its ticket, which waits there.
 * 2. Rovo authenticates at its gate, and with it the graph: Jira comes up
 *    with the Teamwork Graph's core (Confluence, Bitbucket), its board grows
 *    in and takes the waiting tickets into To do.
 * 3. Notify: one is a user-facing bug. A copy goes to Slack (which comes up
 *    behind its gateway) and tells the developer.
 * 4. Kickoff: the developer's terminal comes up and ties into Jira, and the
 *    developer starts the work, the bug first.
 * 5. Understand the issue and the code: one copy per issue reads what it
 *    needs (a bug: Code search, which comes up off Bitbucket; a feature:
 *    Confluence, and Figma through MCP; a chore: the repo) and reports back
 *    to the developer's terminal.
 * 6. Write the change: each copy takes its issue's code ticket and works it
 *    in its own lane (worktree → terminal → Bitbucket) and checks it in.
 * 7. Get it reviewed: a reviewing copy comes out of Rovo at the first
 *    check-in and reads each change's diff at its lane's terminal. Sometimes
 *    it asks for changes: the coder writes again and checks in again, and
 *    it's reviewed again.
 * 8. Get it green and shipped: CI runs (red once, sometimes, then the retry
 *    passes); the change is squash-merged, and each merge ships its own
 *    release through the portal.
 * 9. Keep the docs current: the reviewer writes the release notes in
 *    Confluence and tells the developer; the copy that sent the Slack message
 *    posts the fix there, where it started.
 * 10. Quiet: the copies fly home into Rovo, Jira goes dark. It ends there.
 *
 * Seeded (`seed`): the map and the day (`rollDevDay`: which issues, what
 * each copy reads, review changes, a red CI run, the Slack post, the clouds).
 */
export class RovoDev extends RovoAtlassian {
  /** This run's day, from its seed. */
  readonly day: DevDay;
  /** Where the story is now. */
  beat: DevBeat = 'filed';
  /** The story has run to its end. */
  finished = false;
  /** Every cloud that has floated by. */
  readonly clouds: Cloud[] = [];
  /** Diffs read at a lane's terminal, and reviews that asked for changes. */
  reviews = 0;
  changesRequested = 0;
  /** The copy that reviews every change (out of Rovo at the first check-in). */
  reviewer?: Copy;
  private reviewing: Promise<void> = Promise.resolve();
  /** Clouds and tickets in the air or waiting, ticking. */
  private floating = new Set<Cloud | Ticket>();
  /** The issue each lane's change is for. */
  private readonly laneIssue: (DevIssue | undefined)[] = [];

  constructor(stage: SceneHost, seed = 5) {
    const day = rollDevDay(seed);
    const figma = day.issues.some((i) => i.understand.some((s) => s.system === 'figma'));
    // Its own map: only the systems the day calls on.
    super(stage, seed, { mini: figma ? ['confluence', 'figma'] : ['confluence'] });
    this.day = day;
    // Each merge ships a release of its own.
    this.deployCubes = 8;
  }

  override async start(): Promise<void> {
    const { stage, hub, day } = this;
    const rovo = this.rovo.drone;
    this.running = true;

    // Filed: the team's tickets float in on clouds and wait where Jira's board will be.
    const requests = day.issues.map((issue) => this.dev(issue.title));
    const filed = await this.file();

    // Rovo authenticates at its gate, and with it the graph: Jira comes up, its board grows in and takes the tickets in.
    this.beat = 'arriving';
    await this.enter();
    await hub.showBoard();
    await this.takeIn(filed);

    // Notify: one of them is a user-facing bug. A copy tells the developer in Slack.
    this.beat = 'notify';
    rovo.flash = 1;
    await hub.addTask();
    const notifier = await this.emerge();
    await this.handOver(notifier, POST, -1, this.dev(`Tell the developer: ${day.issues[0].title}`));

    // Kickoff: the developer's terminal comes up and ties into Jira; the developer starts the work, the bug first.
    this.beat = 'kickoff';
    await this.userTerminal();
    await wait(stage, 0.4);
    await hub.report('user-terminal');
    rovo.flash = 1;

    // Understand: a copy per issue reads what it needs and tells the developer.
    this.beat = 'understand';
    const crew = await Promise.all(
      day.issues.map(async (issue, i) => {
        await wait(stage, i * 0.5);
        const copy = await this.emerge();
        await this.handOver(copy, { type: 'read', reportToUser: true, steps: issue.understand }, -1, requests[i]);
        return copy;
      }),
    );

    // Write the change: each copy codes its issue in its own lane; review and CI happen on the way in.
    this.beat = 'build';
    this.flakyCI = day.flakyCI;
    rovo.flash = 1;
    for (let i = 0; i < day.issues.length; i++) await hub.addTask();
    await Promise.all(
      crew.map(async (copy, lane) => {
        await wait(stage, lane * 0.5);
        const issue = day.issues[lane];
        this.laneIssue[lane] = issue;
        await this.handOver(copy, CODE, lane, this.dev(CODE_TITLE[issue.kind](issue.title)));
      }),
    );

    // Shipped: every merge's release through the portal.
    this.beat = 'ship';
    await until(stage, () => this.shipped >= day.issues.length);
    await wait(stage, 0.8);

    // Keep the docs current: the release notes into Confluence and back to the developer; the fix posted in Slack, where it started.
    this.beat = 'document';
    rovo.flash = 1;
    const writer = this.reviewer ?? crew[0];
    await hub.addTask();
    await hub.addTask();
    await Promise.all([
      this.handOver(writer, NOTES, -1, this.dev('Write the release notes')),
      (async () => {
        await wait(stage, 0.4);
        await this.handOver(notifier, POST, -1, this.dev(`Post the fix: ${day.issues[0].title}`));
      })(),
    ]);

    // Quiet: everyone home into Rovo; Jira goes dark and its gears run down.
    this.running = false;
    await wait(stage, 0.6);
    const everyone = [notifier, ...crew, ...(this.reviewer ? [this.reviewer] : [])];
    await Promise.all(everyone.map((c, i) => this.home(c, i * 0.25)));
    rovo.status = 'waiting';
    this.jira.light = 'off';
    this.beat = 'done';
    this.finished = true;
  }

  /**
   * The team files its tickets before anything else is up: for each, a group
   * of clouds floats across over where Jira's board will stand, and the first
   * drops the ticket, which stays where it fell, waiting. The groups follow
   * one another; resolves with the waiting tickets once every one has landed
   * (the last clouds drift on and away).
   */
  private async file(): Promise<Ticket[]> {
    const { stage, hub } = this;
    const across = new Vector3(1, 0, -1).normalize();
    const count = this.day.issues.length;
    const moving = new Set<Cloud | Ticket>();
    stage.onTick((dt) => moving.forEach((m) => m.update(dt)));
    this.floating = moving;
    return Promise.all(
      this.day.issues.map(async (issue, i) => {
        await wait(stage, i * CLOUD_GAP);
        const target = hub.kanban.position.clone().setY(0).addScaledVector(across, (i - (count - 1) / 2) * TICKET_SPACING);
        const group = issue.clouds.map((shape) => new Cloud({ shape, phase: this.random() * Math.PI * 2 }));
        const [lead, ...escorts] = group;
        const offsets = groupOffsets(this.random, escorts.length);
        const ticket = new Ticket(undefined, { label: false });
        ticket.scale.setScalar(DROPPED_SCALE);
        ticket.visible = false;
        for (const c of group) {
          c.visible = false;
          this.clouds.push(c);
          moving.add(c);
        }
        moving.add(ticket);
        stage.add(...group, ticket);
        let landed!: () => void;
        const land = new Promise<void>((resolve) => (landed = resolve));
        void cloudDrop(stage, lead, ticket, target, {
          height: CLOUD_HEIGHT,
          tilt: issue.tilt,
          keep: true,
          onLand: landed,
          escorts: escorts.map((cloud, k) => ({ cloud, offset: offsets[k] })),
        }).then(() => {
          for (const c of group) {
            moving.delete(c);
            c.removeFromParent();
          }
        });
        await land;
        return ticket;
      }),
    );
  }

  /** Jira takes the waiting tickets in, one by one: each shrinks away into it and its card slides into To do. */
  private async takeIn(tickets: Ticket[]): Promise<void> {
    const { stage, hub } = this;
    for (const ticket of tickets) {
      const scale = ticket.scale.x;
      await tween(stage, 0.35, (t) => {
        ticket.scale.setScalar(Math.max(0.001, scale * (1 - t)));
        ticket.opacity = 1 - t;
      });
      this.floating.delete(ticket);
      ticket.removeFromParent();
      await hub.addTask();
    }
  }

  /**
   * Between check-in and CI: the change is reviewed, one change at a time
   * (the reviewer holds one card). The first time, the reviewer comes out of
   * Rovo. Rovo hands it the review's card; it flies to the lane's terminal and
   * reads the diff there, hovering over it. If it asks for changes, the coder
   * writes again and checks in again, and it reads the diff again. Then it
   * approves: it shoots the card to Rovo and waits where it is.
   */
  protected override reviewed(_coder: Drone, lane: CodeLane): Promise<void> {
    const issue = this.laneIssue[lane.index];
    if (!issue) return Promise.resolve();
    const next = this.reviewing.then(async () => {
      const { stage, hub } = this;
      const rovo = this.rovo.drone;
      if (this.beat === 'build') this.beat = 'review';
      this.reviewer ??= await this.emerge();
      const reviewer = this.reviewer;
      const { drone } = reviewer.sub;
      await hub.addTask();
      rovo.flash = 1;
      const card = await hub.takeTask(drone.rig.hover, rovo.rig.hover, this.dev(`Review: ${issue.title}`));
      if (!card) return;
      const run: TaskRun = { id: `task-${this.tasks.length + 1}`, key: card.request.key, title: card.request.title, task: REVIEW_TASK, done: 0 };
      this.tasks.push(run);
      this.copies.set(drone, { card, run });
      drone.status = 'working';
      await fly(stage, DroneFlight.to(drone, lane.terminal.position, { speed: SUB_SPEED, fromHeight: reviewer.from, lift: 0 }));
      reviewer.from = 0;
      await this.readDiff(drone, lane);
      if (issue.changes) {
        // Changes asked for: the coder writes again and checks in again, and the reviewer reads it again.
        this.changesRequested++;
        drone.status = 'waiting';
        lane.terminal.state = 'diff';
        await wait(stage, this.between(REWORK));
        await lane.checkIn(this.scm);
        drone.status = 'working';
        await this.readDiff(drone, lane);
      }
      run.done = run.task.steps.length;
      await hub.finish(card, rovo.rig.hover);
      rovo.flash = 1;
      this.copies.set(drone, {});
      drone.status = 'waiting';
    });
    this.reviewing = next.catch(() => {});
    return next;
  }

  /** The reviewer reads the diff on the lane's terminal, hovering over it. */
  private async readDiff(drone: Drone, lane: CodeLane): Promise<void> {
    const { stage } = this;
    this.working.set(drone, lane.terminal);
    lane.terminal.state = 'diff';
    const signal = attachSignal(stage, drone, lane.terminal);
    await wait(stage, this.between(REVIEW));
    signal.detach();
    this.working.delete(drone);
    this.reviews++;
  }

  /** The day's next Jira issue. */
  private dev(title: string): Request {
    return { key: `DEV-${++this.issues}`, title };
  }
}
