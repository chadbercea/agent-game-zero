import type { Meta, StoryObj } from '@storybook/html-vite';
import { Vector3 } from 'three';
import { Cloud } from '../primitives/cloud/Cloud';
import { Hand } from '../primitives/hand/Hand';
import { Ticket } from '../primitives/ticket/Ticket';
import { spawnDrone } from '../stage/spawnDrone';
import { specimenStage } from '../stage/specimen';
import { opening } from './opening';
import { tween, wait } from './timeline';

const meta: Meta = {
  title: 'Story Rework/01 Opening',
  parameters: { layout: 'fullscreen' },
};
export default meta;

const SPOT = new Vector3(0.6, 0, 0.6);
/** Beside the ticket, to its left on screen, so D3V1N doesn't sit on top of it. */
const DRONE_TO = new Vector3(-0.8, 0, 1.8);
const DRONE_FROM = new Vector3(-8, 0, 4);

/**
 * Beat 1 of the reworked story, on loop: a cloud materializes over the grid,
 * a hand reaches down and hands over a Jira ticket (DEMO-1), waves, and pulls
 * back up; the cloud pops away; D3V1N floats in to the ticket and notices it.
 * No captions.
 */
export const Opening: StoryObj = {
  render: () => {
    const { root, stage } = specimenStage({ viewSize: 8, focusY: 1.4 });
    const cloud = new Cloud();
    const hand = new Hand();
    hand.scale.setScalar(1.4);
    cloud.hand.add(hand);
    const ticket = new Ticket();
    ticket.scale.setScalar(0.7);
    const drone = spawnDrone(stage, DRONE_FROM.x, DRONE_FROM.z, { name: 'D3V1N', showLabel: true, status: 'waiting' }).drone;
    stage.add(cloud, ticket);
    stage.onTick((dt) => {
      cloud.update(dt);
      ticket.update(dt);
    });
    void (async () => {
      for (;;) {
        await wait(stage, 0.6);
        await opening(stage, { cloud, hand, ticket, drone }, { spot: SPOT, cloudHeight: 3.3, droneFrom: DRONE_FROM, droneTo: DRONE_TO });
        await wait(stage, 3);
        // Clear the stage for the next loop.
        await tween(stage, 0.6, (t) => {
          ticket.opacity = 1 - t;
          drone.fade = 1 - t;
        });
      }
    })();
    return root;
  },
};
