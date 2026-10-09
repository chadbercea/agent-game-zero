import type { Meta, StoryObj } from '@storybook/html-vite';
import { rowPosition, specimenStage } from '../../stage/specimen';
import { TERMINAL_STATES, Terminal, type TerminalState } from './Terminal';

interface TerminalArgs {
  state: TerminalState;
  passed: boolean;
}

const meta: Meta<TerminalArgs> = {
  title: 'Primitives/Terminal',
  parameters: { layout: 'fullscreen' },
  argTypes: {
    state: { control: 'inline-radio', options: TERMINAL_STATES },
    passed: { control: 'boolean', description: 'CI passed: the screen flashes green (tail state)' },
  },
  args: { state: 'diff', passed: false },
};
export default meta;

type Story = StoryObj<TerminalArgs>;

/** One terminal, flat on the grid; pick its state. Toggle `passed` to flash it green. */
export const Specimen: Story = {
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 2.6, focusY: 0 });
    const terminal = new Terminal({ state: args.state });
    if (args.passed) terminal.pass();
    stage.add(terminal);
    stage.onTick((dt) => terminal.update(dt));
    return root;
  },
};

/** Off · Admin · Tail · Diff, side by side. */
export const States: Story = {
  render: () => {
    const { root, stage } = specimenStage({ viewSize: 5, focusY: 0 });
    TERMINAL_STATES.forEach((state, i) => {
      const { x, z } = rowPosition(i, TERMINAL_STATES.length, 1.5);
      const terminal = new Terminal({ state, seed: i + 1 });
      terminal.position.set(x, 0, z);
      stage.add(terminal);
      stage.onTick((dt) => terminal.update(dt));
    });
    return root;
  },
};

/** A code change on loop: admin (set up) → diff (write the code) → tail (CI) → pass. */
export const CodeChange: StoryObj = {
  render: () => {
    const { root, stage } = specimenStage({ viewSize: 2.6, focusY: 0 });
    const terminal = new Terminal();
    stage.add(terminal);
    const steps: [TerminalState, number][] = [
      ['admin', 3],
      ['diff', 5.5],
      ['tail', 3],
    ];
    let step = -1;
    let left = 0;
    stage.onTick((dt) => {
      terminal.update(dt);
      left -= dt;
      if (left > 0) return;
      if (step === 2 && !terminal.passed) {
        terminal.pass();
        left = 1.6;
        return;
      }
      step = (step + 1) % steps.length;
      terminal.state = steps[step][0];
      left = steps[step][1];
    });
    return root;
  },
};
