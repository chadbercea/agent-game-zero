import type { Meta, StoryObj } from '@storybook/html-vite';
import { Vector3 } from 'three';
import { Ticket } from '../primitives/ticket/Ticket';
import { spawnDrone } from '../stage/spawnDrone';
import { specimenStage } from '../stage/specimen';
import { dropTicket, handOff, liftTicket } from './request';
import { wait } from './timeline';

const meta: Meta = {
  title: 'Story/02 Request',
  parameters: { layout: 'fullscreen' },
};
export default meta;

type Story = StoryObj;

const TICKET = new Vector3(0, 0, 0);
const D3V1N = new Vector3(-2.6, 0, 1.4);
const ROVO = new Vector3(1.4, 0, -2.6);

/**
 * A request arrives: the ticket drops onto the grid and hands the request to
 * D3V1N. Then the same ticket hands the same request to Rovo, the way it
 * starts both acts of the story. Loops: the ticket is cleared and drops again.
 */
export const Arrival: Story = {
  render: () => {
    const { root, stage } = specimenStage({ viewSize: 7, focusY: 0.6 });
    const ticket = new Ticket();
    ticket.position.copy(TICKET);
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
        await dropTicket(stage, ticket);
        await handOff(stage, ticket, d3v1n);
        d3v1n.status = 'working';
        await wait(stage, 1.5);
        await handOff(stage, ticket, rovo);
        rovo.status = 'working';
        await wait(stage, 2.5);
        await liftTicket(stage, ticket);
        d3v1n.status = rovo.status = 'waiting';
      }
    })();
    return root;
  },
};
