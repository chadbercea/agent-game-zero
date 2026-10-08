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

/**
 * One ticket, floating over its spot. Controls set its request (`key`,
 * `title`), `label` (the name tag; the story's small tickets have none),
 * `glow` (0–1, held here; it settles back on its own in the story) and
 * `opacity` (0–1, card and label together).
 */
export const Specimen: StoryObj<TicketArgs & { label: boolean; glow: number; opacity: number }> = {
  argTypes: { glow: { control: { type: 'range', min: 0, max: 1, step: 0.01 } }, opacity: { control: { type: 'range', min: 0, max: 1, step: 0.01 } } },
  args: { label: true, glow: 0, opacity: 1 },
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 3, focusY: 0.8 });
    const ticket = new Ticket({ key: args.key, title: args.title }, { label: args.label });
    ticket.opacity = args.opacity;
    stage.add(ticket);
    stage.onTick((dt) => {
      ticket.update(dt);
      ticket.glow = Math.max(ticket.glow, args.glow);
    });
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
