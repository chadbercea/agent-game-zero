import type { Meta, StoryObj } from '@storybook/html-vite';
import { Cloud } from '../primitives/cloud/Cloud';
import type { Drone } from '../primitives/drone/Drone';
import { Hand } from '../primitives/hand/Hand';
import { Ticket } from '../primitives/ticket/Ticket';
import { spawnDrone } from '../stage/spawnDrone';
import { specimenStage } from '../stage/specimen';
import type { Stage } from '../stage/Stage';
import { opening } from './opening';
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
  stage.add(cloud, ticket);
  stage.onTick((dt) => {
    cloud.update(dt);
    ticket.update(dt);
  });
  return { cloud, hand, ticket, drone };
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
