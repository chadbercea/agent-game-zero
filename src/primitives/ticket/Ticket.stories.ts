import type { Meta, StoryObj } from '@storybook/html-vite';
import { rowPosition, specimenStage } from '../../stage/specimen';
import { TICKET_STATUSES, Ticket, type TicketStatus } from './Ticket';

interface TicketArgs {
  status: TicketStatus;
  /** How many rows are done, from the top. */
  done: number;
}

const meta: Meta<TicketArgs> = {
  title: 'Primitives/Ticket',
  parameters: { layout: 'fullscreen' },
  argTypes: {
    status: { control: 'inline-radio', options: TICKET_STATUSES },
    done: { control: { type: 'range', min: 0, max: 5, step: 1 } },
  },
  args: { status: 'progress', done: 3 },
};
export default meta;

type Story = StoryObj<TicketArgs>;

function placeTicket(stage: ReturnType<typeof specimenStage>['stage'], x: number, z: number): Ticket {
  const ticket = new Ticket();
  ticket.position.set(x, 0, z);
  stage.add(ticket);
  stage.onTick((dt) => ticket.update(dt));
  return ticket;
}

/** One ticket: pick its status and how many rows are done. */
export const Specimen: Story = {
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 3.2, focusY: 0.9 });
    const ticket = placeTicket(stage, 0, 0);
    ticket.status = args.status;
    ticket.request.rows.slice(0, args.done).forEach((row) => ticket.tick(row.kind));
    return root;
  },
};

/** To Do · In Progress · Blocked · Done. */
export const States: Story = {
  render: () => {
    const { root, stage } = specimenStage({ viewSize: 6, focusY: 0.9 });
    TICKET_STATUSES.forEach((status, i) => {
      const { x, z } = rowPosition(i, TICKET_STATUSES.length, 1.5);
      const ticket = placeTicket(stage, x, z);
      ticket.status = status;
      const done = { todo: 0, progress: 3, blocked: 1, done: 5 }[status];
      ticket.request.rows.slice(0, done).forEach((row) => ticket.tick(row.kind));
    });
    return root;
  },
};

/** The work coming in: rows tick one by one, then the ticket starts over. */
export const Ticking: Story = {
  render: () => {
    const { root, stage } = specimenStage({ viewSize: 3.2, focusY: 0.9 });
    const ticket = placeTicket(stage, 0, 0);
    const { rows } = ticket.request;
    let t = 0;
    stage.onTick((dt) => {
      t += dt;
      const step = Math.floor(t / 1.2);
      if (step === 0) ticket.status = 'todo';
      else if (step <= rows.length) {
        ticket.status = 'progress';
        if (!ticket.isDone(rows[step - 1].kind)) ticket.tick(rows[step - 1].kind);
      } else if (step === rows.length + 1) ticket.status = 'done';
      else if (step > rows.length + 3) {
        t = 0;
        ticket.reset();
      }
    });
    return root;
  },
};
