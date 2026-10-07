import type { Meta, StoryObj } from '@storybook/html-vite';
import { Charge } from '../primitives/charge/Charge';
import { Cloud } from '../primitives/cloud/Cloud';
import type { Drone } from '../primitives/drone/Drone';
import { GRAPH_COLOR } from '../primitives/graph/GraphEdge';
import { Hand } from '../primitives/hand/Hand';
import { Ticket } from '../primitives/ticket/Ticket';
import { spawnDrone } from '../stage/spawnDrone';
import { specimenStage } from '../stage/specimen';
import type { Stage } from '../stage/Stage';
import { opening } from './opening';
import { phoneRovo } from './phoneRovo';
import { REWORK, reworkScene } from './rework';
import { tween, wait } from './timeline';
import { withinReach } from './withinReach';

const meta: Meta = {
  title: 'Story Rework',
  parameters: { layout: 'fullscreen' },
};
export default meta;

/** The reworked story's cast, in its places: the cloud with its hand, the ticket, D3V1N (all hidden to start). */
function cast(stage: Stage) {
  const cloud = new Cloud();
  const hand = new Hand();
  hand.scale.setScalar(1.4);
  cloud.hand.add(hand);
  const ticket = new Ticket();
  ticket.scale.setScalar(0.7);
  const drone: Drone = spawnDrone(stage, REWORK.d3v1nFrom.x, REWORK.d3v1nFrom.z, {
    name: 'D3V1N',
    showLabel: true,
    status: 'waiting',
  }).drone;
  const rovo: Drone = spawnDrone(stage, REWORK.rovoFrom.x, REWORK.rovoFrom.z, {
    name: 'Rovo',
    lineage: 'cyan',
    showLabel: true,
    status: 'waiting',
  }).drone;
  rovo.visible = false;
  // D3V1N's charge: off until Rovo powers it up through the gateway.
  const charge = new Charge(GRAPH_COLOR);
  drone.rig.hover.add(charge);
  stage.add(cloud, ticket);
  stage.onTick((dt) => {
    cloud.update(dt);
    ticket.update(dt);
    charge.update(dt);
  });
  return { cloud, hand, ticket, drone, rovo, charge };
}

const places = {
  spot: REWORK.ticketSpot,
  cloudHeight: REWORK.cloudHeight,
  droneFrom: REWORK.d3v1nFrom,
  droneTo: REWORK.d3v1n,
};

/**
 * Beat 1, on loop: a cloud materializes over the grid, a hand reaches down
 * and hands over a Jira ticket (DEMO-1), waves, and pulls back up; the cloud
 * pops away; D3V1N floats in to the ticket and notices it. No captions.
 */
export const Opening: StoryObj = {
  name: '01 Opening',
  render: () => {
    const { root, stage } = specimenStage({ viewSize: 8, focusY: 1.4 });
    stage.centerOn(REWORK.ticketSpot.clone().setY(1.4));
    const c = cast(stage);
    void (async () => {
      for (;;) {
        await wait(stage, 0.6);
        await opening(stage, c, places);
        await wait(stage, 3);
        await tween(stage, 0.6, (t) => {
          c.ticket.opacity = 1 - t;
          c.drone.fade = 1 - t;
        });
      }
    })();
    return root;
  },
};

/**
 * Beats 1 and 2, on loop. After the opening, D3V1N works within its reach:
 * its access lines draw out to Jira and GitHub (the other tools show only as
 * faint ghosts, out of reach); the ticket goes into Jira and D3V1N reads it
 * there; then it rides its lines to GitHub, starts a branch, and keeps
 * working. No captions.
 */
export const WithinReach: StoryObj = {
  name: '02 Within Reach',
  render: () => {
    const { root, stage } = specimenStage({ viewSize: 13, focusY: 0.8 });
    stage.centerOn(REWORK.center.clone().setY(0.8));
    const scene = reworkScene(stage);
    const c = cast(stage);
    void (async () => {
      for (;;) {
        await wait(stage, 0.6);
        await opening(stage, c, places);
        await wait(stage, 0.8);
        const stop = await withinReach(stage, { drone: c.drone, ticket: c.ticket, scene });
        await wait(stage, 6);
        // Clear the stage for the next loop.
        await tween(stage, 0.8, (t) => {
          c.ticket.opacity = 1 - t;
          c.drone.fade = 1 - t;
          for (const r of Object.values(scene.reach)) r!.line.drawn = 1 - t;
        });
        stop();
        c.drone.status = 'waiting';
        for (const node of Object.values(scene.nodes)) node.visible = false;
      }
    })();
    return root;
  },
};

/**
 * Beats 1 to 3, on loop. While D3V1N works at GitHub, it phones Rovo: a
 * handset rides its lines to Jira, rings, and goes out. Rovo flies in to
 * Jira and fires up the rest of the Teamwork Graph (a wave brings every
 * ghost tool online; the graph's links draw in), then secures D3V1N's way
 * in: the glass gateway over its line to Jira, and the lock. Power comes
 * through to D3V1N, and it charges up. No captions.
 */
export const PhonesRovo: StoryObj = {
  name: '03 Phones Rovo',
  render: () => {
    const { root, stage } = specimenStage({ viewSize: 13, focusY: 0.8 });
    stage.centerOn(REWORK.center.clone().setY(0.8));
    const scene = reworkScene(stage);
    const c = cast(stage);
    void (async () => {
      for (;;) {
        await wait(stage, 0.6);
        await opening(stage, c, places);
        await wait(stage, 0.8);
        const stopWork = await withinReach(stage, { drone: c.drone, ticket: c.ticket, scene });
        await wait(stage, 1.5);
        const letRovoGo = await phoneRovo(stage, { drone: c.drone, rovo: c.rovo, charge: c.charge, scene });
        await wait(stage, 6);
        // Clear the stage for the next loop.
        await tween(stage, 0.8, (t) => {
          c.ticket.opacity = 1 - t;
          c.drone.fade = c.rovo.fade = 1 - t;
          c.charge.level = 1 - t;
          for (const r of Object.values(scene.reach)) r!.line.drawn = 1 - t;
          scene.gateway.built = scene.gateway.lockDrop = 1 - t;
        });
        letRovoGo();
        stopWork();
        scene.graph.hide();
        scene.gateway.conduit.streams = 0;
        c.rovo.visible = false;
        c.drone.scale.setScalar(1);
        c.drone.status = 'waiting';
        for (const node of Object.values(scene.nodes)) {
          node.visible = false;
          node.light = 'off';
        }
      }
    })();
    return root;
  },
};
