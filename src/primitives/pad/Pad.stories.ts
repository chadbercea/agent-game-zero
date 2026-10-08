import type { Meta, StoryObj } from '@storybook/html-vite';
import { STATUS_COLOR, STATUSES, type Status } from '../../core/palette';
import { specimenStage } from '../../stage/specimen';
import { Pad } from './Pad';

interface PadArgs {
  /** The pad's light, via `setColor`: off (no color) or a status color. */
  light: 'off' | Status;
}

const meta: Meta<PadArgs> = {
  title: 'Primitives/Pad',
  parameters: { layout: 'fullscreen' },
  argTypes: { light: { control: 'inline-radio', options: ['off', ...STATUSES] } },
  args: { light: 'working' },
};
export default meta;

/**
 * Pad: the low slab every gate and tool stands on, with a screen, a skirt
 * and a floor glow. The control sets its light through `setColor` (null for
 * off, or a status color).
 */
export const Specimen: StoryObj<PadArgs> = {
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 3, focusY: 0.1 });
    const pad = new Pad();
    pad.setColor(args.light === 'off' ? null : STATUS_COLOR[args.light]);
    stage.add(pad);
    return root;
  },
};
