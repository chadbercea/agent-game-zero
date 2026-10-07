import { Charge } from '../primitives/charge/Charge';
import { Cloud } from '../primitives/cloud/Cloud';
import type { Drone } from '../primitives/drone/Drone';
import { GRAPH_COLOR } from '../primitives/graph/GraphEdge';
import { Hand } from '../primitives/hand/Hand';
import { Ticket } from '../primitives/ticket/Ticket';
import { spawnDrone } from '../stage/spawnDrone';
import type { SceneHost } from '../stage/Stage';
import { juicedCrew } from './juicedCrew';
import { opening } from './opening';
import { phoneRovo } from './phoneRovo';
import { REWORK, type ReworkScene, reworkScene } from './rework';
import { tween, wait } from './timeline';
import { withinReach } from './withinReach';

/** The reworked story's beats, in order. */
export const REWORK_BEATS = ['opening', 'within-reach', 'phones-rovo', 'juiced-crew'] as const;
export type ReworkBeat = (typeof REWORK_BEATS)[number];

/**
 * The reworked story (milestone "Story Rework"), beat by beat on one grid:
 * the cast in its places, `play(through)` runs the beats in order up to and
 * including `through`, and `reset()` clears the stage for another run.
 */
export class ReworkStory {
  readonly scene: ReworkScene;
  readonly cloud = new Cloud();
  readonly hand = new Hand();
  readonly ticket = new Ticket();
  readonly drone: Drone;
  readonly rovo: Drone;
  /** D3V1N's charge: off until Rovo powers it up through the gateway. */
  readonly charge = new Charge(GRAPH_COLOR);
  private cleanups: (() => void)[] = [];

  constructor(private readonly stage: SceneHost) {
    this.scene = reworkScene(stage);
    this.hand.scale.setScalar(1.4);
    this.cloud.hand.add(this.hand);
    this.ticket.scale.setScalar(0.7);
    this.drone = spawnDrone(stage, REWORK.d3v1nFrom.x, REWORK.d3v1nFrom.z, {
      name: 'D3V1N',
      showLabel: true,
      status: 'waiting',
    }).drone;
    this.rovo = spawnDrone(stage, REWORK.rovoFrom.x, REWORK.rovoFrom.z, {
      name: 'Rovo',
      lineage: 'cyan',
      showLabel: true,
      status: 'waiting',
    }).drone;
    this.rovo.visible = false;
    this.drone.rig.hover.add(this.charge);
    stage.add(this.cloud, this.ticket);
    stage.onTick((dt) => {
      this.cloud.update(dt);
      this.ticket.update(dt);
      this.charge.update(dt);
    });
  }

  /** Play from the top through `through`, in order. */
  async play(through: ReworkBeat = REWORK_BEATS[REWORK_BEATS.length - 1]): Promise<void> {
    const { stage, scene, drone, rovo, charge, ticket } = this;
    const upTo = REWORK_BEATS.indexOf(through);
    await opening(stage, this, {
      spot: REWORK.ticketSpot,
      cloudHeight: REWORK.cloudHeight,
      droneFrom: REWORK.d3v1nFrom,
      droneTo: REWORK.d3v1n,
    });
    if (upTo < 1) return;
    await wait(stage, 0.8);
    const stopSolo = await withinReach(stage, { drone, ticket, scene });
    let soloStopped = false;
    const stopSoloOnce = () => {
      if (soloStopped) return;
      soloStopped = true;
      stopSolo();
    };
    this.cleanups.push(stopSoloOnce);
    if (upTo < 2) return;
    await wait(stage, 1.5);
    this.cleanups.push(await phoneRovo(stage, { drone, rovo, charge, scene }));
    if (upTo < 3) return;
    await wait(stage, 1.2);
    this.cleanups.push(await juicedCrew(stage, { drone, scene, stopSolo: stopSoloOnce }));
  }

  /** Fade everything out and put the stage back as it was before the opening. */
  async reset(): Promise<void> {
    const { stage, scene, drone, rovo, charge, ticket } = this;
    await tween(stage, 0.8, (t) => {
      ticket.opacity = 1 - t;
      drone.fade = rovo.fade = 1 - t;
      charge.level = Math.min(charge.level, 1 - t);
      for (const r of Object.values(scene.reach)) r!.line.drawn = 1 - t;
      scene.gateway.built = Math.min(scene.gateway.built, 1 - t);
      scene.gateway.lockDrop = Math.min(scene.gateway.lockDrop, 1 - t);
    });
    for (const cleanup of this.cleanups.splice(0).reverse()) cleanup();
    scene.graph.hide();
    scene.gateway.conduit.streams = 0;
    rovo.visible = false;
    drone.scale.setScalar(1);
    drone.status = 'waiting';
    for (const node of Object.values(scene.nodes)) {
      node.visible = false;
      node.light = 'off';
    }
  }
}
