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
import { fly, until, wait } from './timeline';

/**
 * The story's beats, in order: the developer's jobs to be done. Understand
 * the issue and the code; write the change; get it reviewed; get it green
 * and shipped; keep the docs current.
 */
export const DEV_BEATS = ['arriving', 'intake', 'asked', 'understand', 'build', 'review', 'ship', 'document', 'done'] as const;
export type DevBeat = (typeof DEV_BEATS)[number];

/** How high the clouds float as they bring the team's issues in. */
const CLOUD_HEIGHT = 4.6;
/** Seconds between one group of clouds and the next. */
const CLOUD_GAP = 2.6;
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
 * 1. Rovo comes in the way it always does: gate, access, Jira, and the
 *    Teamwork Graph's core (Confluence, Bitbucket) around it.
 * 2. Intake: the team's issues arrive. Clouds (the humans in the loop) float
 *    over Jira's board, one group per issue, and each drops its card into
 *    To do.
 * 3. The ask: the developer's terminal comes up, ties into Jira, and the ask
 *    rides in: take these.
 * 4. Understand the issue and the code: one copy per issue reads what it
 *    needs (a bug: Code search, which comes up off Bitbucket; a feature:
 *    Confluence, and Figma through MCP; a chore: the repo) and reports back
 *    to the developer's terminal.
 * 5. Write the change: each copy takes its issue's code ticket and works it
 *    in its own lane (worktree → terminal → Bitbucket) and checks it in.
 * 6. Get it reviewed: a reviewing copy comes out of Rovo at the first
 *    check-in and reads each change's diff at its lane's terminal. Sometimes
 *    it asks for changes: the coder writes again and checks in again, and
 *    it's reviewed again.
 * 7. Get it green and shipped: CI runs (red once, sometimes, then the retry
 *    passes); the change is squash-merged, and each merge ships its own
 *    release through the portal.
 * 8. Keep the docs current: the reviewer writes the release notes in
 *    Confluence and tells the developer; sometimes a coder posts it in Slack.
 * 9. Quiet: the copies fly home into Rovo, Jira goes dark. It ends there.
 *
 * Seeded (`seed`): the map and the day (`rollDevDay`: which issues, what
 * each copy reads, review changes, a red CI run, the Slack post, the clouds).
 */
export class RovoDev extends RovoAtlassian {
  /** This run's day, from its seed. */
  readonly day: DevDay;
  /** Where the story is now. */
  beat: DevBeat = 'arriving';
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
    await this.enter();

    // Intake: the team's issues float in on clouds and drop onto Jira's board.
    this.beat = 'intake';
    await hub.showBoard();
    const requests = day.issues.map((issue) => this.dev(issue.title));
    await this.intake();

    // The ask: the developer's terminal comes up and ties into Jira; the ask rides in.
    this.beat = 'asked';
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

    // Keep the docs current: the release notes into Confluence and back to the developer; maybe a post in Slack.
    this.beat = 'document';
    rovo.flash = 1;
    const writer = this.reviewer ?? crew[0];
    await hub.addTask();
    if (day.slack) await hub.addTask();
    await Promise.all([
      this.handOver(writer, NOTES, -1, this.dev('Write the release notes')),
      day.slack
        ? (async () => {
            await wait(stage, 0.4);
            await this.handOver(crew[0], POST, -1, this.dev('Post the release'));
          })()
        : undefined,
    ]);

    // Quiet: everyone home into Rovo; Jira goes dark and its gears run down.
    this.running = false;
    await wait(stage, 0.6);
    const everyone = this.reviewer ? [...crew, this.reviewer] : crew;
    await Promise.all(everyone.map((c, i) => this.home(c, i * 0.25)));
    rovo.status = 'waiting';
    this.jira.light = 'off';
    this.beat = 'done';
    this.finished = true;
  }

  /**
   * The team's issues come in: for each, a group of clouds floats across over
   * Jira's board, the first drops the issue's card, and once it's taken in the
   * card slides into To do. The groups follow one another; resolves when every
   * card is on the board (the last clouds drift on and away).
   */
  private async intake(): Promise<void> {
    const { stage, hub } = this;
    const target = hub.kanban.position.clone().setY(0);
    const moving = new Set<Cloud | Ticket>();
    const untick = stage.onTick((dt) => moving.forEach((m) => m.update(dt)));
    let drifting = 0;
    await Promise.all(
      this.day.issues.map(async (issue, i) => {
        await wait(stage, i * CLOUD_GAP);
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
        drifting++;
        void cloudDrop(stage, lead, ticket, target, {
          height: CLOUD_HEIGHT,
          tilt: issue.tilt,
          onLand: landed,
          escorts: escorts.map((cloud, k) => ({ cloud, offset: offsets[k] })),
        }).then(() => {
          for (const m of [...group, ticket]) {
            moving.delete(m);
            m.removeFromParent();
          }
          if (--drifting === 0) untick();
        });
        await land;
        await hub.addTask();
      }),
    );
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
