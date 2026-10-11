import { DroneFlight } from '../animation/DroneFlight';
import type { Request, Ticket } from '../primitives/ticket/Ticket';
import { type SpawnedDrone, spawnDrone } from '../stage/spawnDrone';
import { AT_ROVOS_BODY, EMERGE_SECONDS, RovoAtlassian, SUB_SPEED, type TaskRun } from './rovoAtlassian';
import type { Task } from './rovoTasks';
import { fly, tween, until, wait } from './timeline';

/** The feature's code tickets: more than there are coders, so the first one done picks up the last. */
export const FEATURE_PARTS = ['Build the API', 'Build the UI', 'Wire up the data', 'Add the tests'] as const;
/** Coders on the feature, each in its own lane. */
export const FEATURE_CODERS = 3;
/** Releases the feature ships in: every two merges fill the assembler's 2 × 2 × 2. */
export const FEATURE_RELEASES = FEATURE_PARTS.length / 2;

/** The story's beats, in order. */
export const FEATURE_BEATS = ['arriving', 'asked', 'spec', 'build', 'ship', 'wrap-up', 'done'] as const;
/** Where the story is. */
export type FeatureBeat = (typeof FEATURE_BEATS)[number];

/** The scripted tasks, as Jira issues: each a request and the steps a copy runs (docs/rovo-mental-model.md). */
const SPEC: Task = {
  type: 'spec',
  reportToUser: true,
  steps: [
    { system: 'confluence', action: 'read' },
    { system: 'figma', action: 'read', mcp: true },
    { system: 'confluence', action: 'update' },
  ],
};
const CODE: Task = { type: 'code', steps: [{ system: 'bitbucket', action: 'code' }] };
const ANNOUNCE: Task = { type: 'slack', steps: [{ system: 'slack', action: 'send' }] };
const NOTES: Task = { type: 'doc', reportToUser: true, steps: [{ system: 'confluence', action: 'write' }] };

/** A copy of Rovo out on the grid, and the height it's flying at. */
interface Copy {
  sub: SpawnedDrone;
  from: number;
}

/**
 * Rovo ships a feature (Story Narrative): one request from the user, followed
 * all the way to production, built from the same pieces as Rovo on the
 * Atlassian Grid and by the same rules (docs/rovo-mental-model.md).
 *
 * 1. Rovo comes in the way it always does: gate, access, Jira, and the
 *    Teamwork Graph's core (Confluence, Bitbucket) around it.
 * 2. The ask: the user's terminal comes up, ties into Jira, and the request
 *    rides in. One card on the board: the spec.
 * 3. Spec: a copy of Rovo reads Confluence, reads the design from Figma
 *    through MCP (Figma comes and goes), writes the spec back to Confluence,
 *    and tells the user.
 * 4. Build: Rovo breaks it down into four code tickets. Three coders each
 *    build a lane (worktree → terminal → Bitbucket) and run the code
 *    lifecycle; the first one free takes the fourth. Each merge deploys.
 * 5. Ship: every two merges fill the assembler; two releases ride the belt
 *    through the portal.
 * 6. Wrap-up: one copy announces it in Slack (Slack and its gateway come up
 *    for it); another writes the release notes in Confluence and tells the user.
 * 7. Quiet: the copies fly home into Rovo, Jira's light goes off, and its
 *    gears run down. It ends there.
 *
 * Seeded (`seed`): the map, timings and crew order; the plot is the same.
 */
export class RovoFeature extends RovoAtlassian {
  /** Where the story is now. */
  beat: FeatureBeat = 'arriving';
  /** The story has run to its end. */
  finished = false;

  override async start(): Promise<void> {
    const { stage, hub } = this;
    const rovo = this.rovo.drone;
    this.running = true;
    await this.enter();

    // The ask: the user's terminal comes up and ties into Jira; the request rides in.
    this.beat = 'asked';
    await this.userTerminal();
    await wait(stage, 0.4);
    await hub.report('user-terminal');
    rovo.flash = 1;
    await hub.showBoard();
    await hub.addTask();

    // Spec: one copy, the spec loop, back to the user.
    this.beat = 'spec';
    const writer = await this.emerge();
    await this.handOver(writer, SPEC, -1, { title: 'Spec the feature from Figma' });

    // Build: four code tickets onto the board; three coders, each in its own lane, take them as they're free.
    this.beat = 'build';
    rovo.flash = 1;
    for (let i = 0; i < FEATURE_PARTS.length; i++) await hub.addTask();
    const parts = [...FEATURE_PARTS];
    const coders = await Promise.all(
      Array.from({ length: FEATURE_CODERS }, async (_, lane) => {
        await wait(stage, lane * 0.5);
        const coder = await this.emerge();
        for (let part = parts.shift(); part; part = parts.shift()) await this.handOver(coder, CODE, lane, { title: part });
        return coder;
      }),
    );

    // Ship: the last merge's release rides the belt through the portal.
    this.beat = 'ship';
    await until(stage, () => this.shipped >= FEATURE_RELEASES);
    await wait(stage, 0.8);

    // Wrap-up: the news goes out in Slack, and the release notes go into Confluence and back to the user.
    this.beat = 'wrap-up';
    rovo.flash = 1;
    await hub.addTask();
    await hub.addTask();
    await Promise.all([
      this.handOver(coders[0], ANNOUNCE, -1, { title: 'Announce the release' }),
      (async () => {
        await wait(stage, 0.4);
        await this.handOver(writer, NOTES, -1, { title: 'Write the release notes' });
      })(),
    ]);

    // Quiet: everyone home into Rovo; Jira goes dark and its gears run down.
    this.running = false;
    await wait(stage, 0.6);
    await Promise.all([writer, ...coders].map((c, i) => this.home(c, i * 0.25)));
    rovo.status = 'waiting';
    this.jira.light = 'off';
    this.beat = 'done';
    this.finished = true;
  }

  /** A copy of Rovo, born inside it, full size. */
  private async emerge(): Promise<Copy> {
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
   * Rovo hands `copy` the next card off the board as a Jira issue, and the
   * copy runs `task` (in coding lane `lane`, or -1), shoots the finished card
   * back to Rovo, and waits where it is.
   */
  private async handOver(copy: Copy, task: Task, lane: number, request: Pick<Request, 'title'>): Promise<void> {
    const rovo = this.rovo.drone;
    const { drone } = copy.sub;
    rovo.flash = 1;
    const card = await this.hub.takeTask(drone.rig.hover, rovo.rig.hover, { key: `FEAT-${++this.issues}`, title: request.title });
    if (!card) return;
    drone.status = 'working';
    const held: { card: Ticket; run?: TaskRun } = { card };
    this.copies.set(drone, held);
    copy.from = await this.runTask(copy.sub, task, card, lane, copy.from, (run) => (held.run = run));
    this.copies.set(drone, {});
    drone.status = 'waiting';
  }

  /** The work is done: the copy flies home into Rovo and fades into it. */
  private async home(copy: Copy, delay: number): Promise<void> {
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
}
