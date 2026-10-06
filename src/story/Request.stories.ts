import type { Meta, StoryObj } from '@storybook/html-vite';
import { Vector3 } from 'three';
import { DroneFlight } from '../animation/DroneFlight';
import { Ticket } from '../primitives/ticket/Ticket';
import { spawnDrone } from '../stage/spawnDrone';
import { specimenStage } from '../stage/specimen';
import { dropTicket, handOff, liftTicket, pickUp } from './request';
import { fly, wait } from './timeline';

const meta: Meta = {
  title: 'Story/02 Request',
  parameters: { layout: 'fullscreen' },
};
export default meta;

type Story = StoryObj;

const HOME = new Vector3(-2.2, 0, 1);
const DROP = new Vector3(-1.4, 0, 2);
const WORK = new Vector3(1.2, 0, -1.2);
const ROVO = new Vector3(3, 0, 1.8);

/**
 * A request arrives: the ticket drops in front of D3V1N, D3V1N reads it and
 * picks it up, and the card rides with D3V1N as it flies off to work. Then
 * Rovo picks up the same request from the same ticket. Loops: the ticket is
 * cleared, D3V1N flies home, and a fresh ticket drops.
 */
export const Arrival: Story = {
  render: () => {
    const { root, stage } = specimenStage({ viewSize: 8, focusY: 1.6 });
    const ticket = new Ticket();
    ticket.visible = false;
    stage.add(ticket);
    stage.onTick((dt) => ticket.update(dt));
    const d3v1n = spawnDrone(stage, HOME.x, HOME.z, { name: 'D3V1N', showLabel: true, status: 'waiting' }).drone;
    const rovo = spawnDrone(stage, ROVO.x, ROVO.z, {
      name: 'Rovo',
      lineage: 'cyan',
      showLabel: true,
      status: 'waiting',
    }).drone;
    void (async () => {
      for (;;) {
        await wait(stage, 1);
        await dropTicket(stage, ticket, DROP);
        await handOff(stage, ticket, d3v1n);
        const letGo = await pickUp(stage, ticket, d3v1n);
        d3v1n.status = 'working';
        await fly(stage, DroneFlight.to(d3v1n, WORK));
        ticket.status = 'progress';
        await wait(stage, 1);
        await handOff(stage, ticket, rovo);
        rovo.status = 'working';
        await wait(stage, 2.5);
        letGo();
        await liftTicket(stage, ticket);
        d3v1n.status = rovo.status = 'waiting';
        await fly(stage, DroneFlight.to(d3v1n, HOME));
      }
    })();
    return root;
  },
};
