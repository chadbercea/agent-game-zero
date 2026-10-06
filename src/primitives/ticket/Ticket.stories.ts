import type { Meta, StoryObj } from '@storybook/html-vite';
import { specimenStage } from '../../stage/specimen';
import { DEFAULT_REQUEST, Ticket } from './Ticket';

interface TicketArgs {
  key: string;
  title: string;
}

const meta: Meta<TicketArgs> = {
  title: 'Primitives/Ticket',
  parameters: { layout: 'fullscreen' },
  args: { ...DEFAULT_REQUEST },
};
export default meta;

type Story = StoryObj<TicketArgs>;

/** One ticket, floating over its spot. Edit the key and title. */
export const Specimen: Story = {
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 3, focusY: 0.8 });
    const ticket = new Ticket({ key: args.key, title: args.title });
    stage.add(ticket);
    stage.onTick((dt) => ticket.update(dt));
    return root;
  },
};

/** The hand-off glow: the card lights green and settles back, every two seconds. */
export const Glow: Story = {
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 3, focusY: 0.8 });
    const ticket = new Ticket({ key: args.key, title: args.title });
    stage.add(ticket);
    let since = 0;
    stage.onTick((dt) => {
      since += dt;
      if (since > 2) {
        since = 0;
        ticket.glow = 1;
      }
      ticket.update(dt);
    });
    return root;
  },
};
