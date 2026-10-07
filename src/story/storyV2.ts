import { Cloud } from '../primitives/cloud/Cloud';
import type { Drone } from '../primitives/drone/Drone';
import { Job } from '../primitives/job/Job';
import type { SystemKind } from '../primitives/node/emblems';
import { EMBLEM_SCALE, type SystemNode } from '../primitives/node/SystemNode';
import { Ticket } from '../primitives/ticket/Ticket';
import { FACE_CAMERA } from '../stage/spawnDrone';
import type { SceneHost } from '../stage/Stage';
import { accessCheck } from './accessCheck';
import { budOut } from './crew';
import { JOB_SECONDS } from './fanOut';
import { HumanLoop } from './humanLoop';
import { D3V1N_REQUEST, HOME } from './layout';
import { leaveBase } from './leaveBase';
import { opening } from './opening';
import { absorb, handOff } from './request';
import { revealMap } from './revealMap';
import { tween, wait } from './timeline';
import { type TwoActScene, twoActScene } from './twoActs';

/** The v2 story's beats, in order (more land as they're rebuilt on the two-system scene). */
export const V2_BEATS = ['opening', 'own-system'] as const;
export type V2Beat = (typeof V2_BEATS)[number];

/** How high the clouds float over this scene. */
export const V2_CLOUD_HEIGHT = 3.4;
/** D3V1N floats in from off the grid, front-left of its home. */
const D3V1N_FROM = HOME.clone().set(HOME.x - 6, 0, HOME.z + 3);

/**
 * The reworked story, v2 (ILI-947): the new beats played on the two-system
 * scene, D3V1N's gate and its own third-party tools laid out by the grid
 * guide, and the Atlassian gate with Rovo's Teamwork Graph behind it.
 * `play(through)` runs the beats in order up to and including `through`;
 * `reset()` clears the stage for another run.
 */
export class StoryV2 {
  readonly scene: TwoActScene;
  readonly cloud = new Cloud();
  readonly ticket = new Ticket();
  /** The human in the loop: clouds drifting by, dropping issues into Jira, Confluence and Notion. */
  readonly humans: HumanLoop;
  private cleanups: (() => void)[] = [];

  constructor(private readonly stage: SceneHost) {
    this.scene = twoActScene(stage);
    // Nothing's mapped yet: each system shows only once its agent gets access.
    this.scene.act1.map.hide();
    this.scene.act2.map.hide();
    this.cloud.visible = false;
    this.ticket.scale.setScalar(0.7);
    this.ticket.visible = false;
    stage.add(this.cloud, this.ticket);
    stage.onTick((dt) => {
      if (this.cloud.visible) this.cloud.update(dt);
      this.ticket.update(dt);
    });
    this.humans = new HumanLoop(stage, this.nodes(), 7);
  }

  get drone(): Drone {
    return this.scene.drone;
  }

  /** Every tool on the grid, by kind, across both systems. */
  nodes(): Record<SystemKind, SystemNode> {
    const all = [...this.scene.act1.map.nodes, ...this.scene.act2.map.nodes];
    return Object.fromEntries(all.map((n) => [n.kind, n])) as Record<SystemKind, SystemNode>;
  }

  /** Play from the top through `through`, in order. */
  async play(through: V2Beat = V2_BEATS[V2_BEATS.length - 1]): Promise<void> {
    const { stage } = this;
    const upTo = V2_BEATS.indexOf(through);
    // Beat 1: a cloud drops DEMO-1 in front of D3V1N's home; D3V1N floats in and notices it.
    await opening(stage, this, {
      spot: D3V1N_REQUEST,
      cloudHeight: V2_CLOUD_HEIGHT,
      droneFrom: D3V1N_FROM,
      droneTo: HOME,
    });
    if (upTo < 1) return;
    await wait(stage, 0.6);
    await this.ownSystem();
  }

  /**
   * Beat 2: D3V1N in its own system. It takes the ticket, flies to its gate
   * and checks access (yellow, then green), and its system maps out the way
   * it always has: traces draw out over the faint grid, the tools rise, and
   * the lines fade off. It sends one sub-agent along its trace to GitHub,
   * which starts a branch and keeps working. From here on, clouds drift by
   * and drop issues into the human tools that are online (Notion, for now).
   */
  private async ownSystem(): Promise<void> {
    const { stage, drone, ticket, scene } = this;
    const { gate, map } = scene.act1;
    await handOff(stage, ticket, drone);
    await absorb(stage, ticket);
    if (!(await accessCheck(stage, drone, gate))) return;
    await revealMap(stage, map);
    this.humans.start();
    this.cleanups.push(() => this.humans.stop());

    // One sub-agent to GitHub, along D3V1N's trace, to start a branch.
    const i = map.nodes.findIndex((n) => n.kind === 'github');
    const github = map.nodes[i];
    map.setActive(i, true);
    const sub = await budOut(stage, drone, `${drone.name}.1`, map.routes[i], github.position);
    sub.drone.rotation.y = FACE_CAMERA;
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
    this.cleanups.push(() => {
      untick();
      job.removeFromParent();
      github.emblem.visible = true;
      github.emblem.scale.setScalar(EMBLEM_SCALE);
      github.light = 'off';
      map.setActive(i, false);
      sub.despawn();
    });
    await tween(stage, 0.4, (k) => github.emblem.scale.setScalar(EMBLEM_SCALE * Math.max(0.001, 1 - k)));
    github.emblem.visible = false;
  }

  /** Fade everything out and put the stage back as it was before the opening. */
  async reset(): Promise<void> {
    const { stage, scene, drone, ticket } = this;
    for (const cleanup of this.cleanups.splice(0).reverse()) cleanup();
    ticket.visible = false;
    const { gate, signal } = scene.act1;
    if (gate.state !== 'off') await leaveBase(stage, { drone, gate, signal }, HOME);
    await tween(stage, 0.6, (t) => (drone.fade = 1 - t));
    drone.status = 'waiting';
    scene.act1.map.hide();
    scene.act2.map.hide();
  }
}
