import type { Meta, StoryObj } from '@storybook/html-vite';
import { Vector3 } from 'three';
import { Ticket } from '../primitives/ticket/Ticket';
import { spawnDrone } from '../stage/spawnDrone';
import { specimenStage } from '../stage/specimen';
import { takeRequest } from './request';
import { wait } from './timeline';
import { SMALL_TICKET } from './trickle';

const meta: Meta = {
  title: 'Story/02 Request',
  parameters: { layout: 'fullscreen' },
};
export default meta;

type Story = StoryObj;

const D3V1N = new Vector3(-1.6, 0, 0.8);
const ROVO = new Vector3(1.6, 0, -0.8);
const IN_FRONT = new Vector3(0.8, 0, 1);

/**
 * A request arrives: a small ticket (DEMO-1, like any other request) drops in
 * front of D3V1N, D3V1N takes it, and the ticket is gone. Then the same
 * request lands in front of Rovo. Loops.
 */
export const Arrival: Story = {
  render: () => {
    const { root, stage } = specimenStage({ viewSize: 6, focusY: 1.2 });
    const ticket = new Ticket(undefined, { label: false });
    ticket.scale.setScalar(SMALL_TICKET);
    ticket.visible = false;
    stage.add(ticket);
    stage.onTick((dt) => ticket.update(dt));
    const d3v1n = spawnDrone(stage, D3V1N.x, D3V1N.z, { name: 'D3V1N', showLabel: true, status: 'waiting' }).drone;
    const rovo = spawnDrone(stage, ROVO.x, ROVO.z, {
      name: 'Rovo',
      lineage: 'cyan',
      showLabel: true,
      status: 'waiting',
    }).drone;
    void (async () => {
      for (;;) {
        await wait(stage, 1);
        await takeRequest(stage, ticket, D3V1N.clone().add(IN_FRONT), d3v1n);
        d3v1n.status = 'working';
        await wait(stage, 1);
        await takeRequest(stage, ticket, ROVO.clone().add(IN_FRONT), rovo);
        rovo.status = 'working';
        await wait(stage, 2.5);
        d3v1n.status = rovo.status = 'waiting';
      }
    })();
    return root;
  },
};
