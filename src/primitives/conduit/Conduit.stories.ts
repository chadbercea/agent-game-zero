import type { Meta, StoryObj } from '@storybook/html-vite';
import type { SharedRun } from '../../core/sharedRuns';
import { specimenStage } from '../../stage/specimen';
import { Conduit } from './Conduit';

interface ConduitArgs {
  /** `level` (0–1): how far the glass has risen. */
  level: number;
  /** `streams` (0–1): the dashes of data flowing inside. */
  streams: number;
  /** Calls `grant()` this often, in seconds (0 = never): the glass flashes green. */
  grantEvery: number;
}

const unit = { control: { type: 'range', min: 0, max: 1, step: 0.01 } } as const;

const meta: Meta<ConduitArgs> = {
  title: 'Primitives/Conduit',
  parameters: { layout: 'fullscreen' },
  argTypes: { level: unit, streams: unit, grantEvery: { control: { type: 'range', min: 0, max: 5, step: 0.5 } } },
  args: { level: 1, streams: 1, grantEvery: 0 },
};
export default meta;

/** Four squares long, two lanes wide. */
const RUN: SharedRun = { along: 'x', from: -2, to: 2, low: -0.5, high: 0 };

/**
 * Conduit: a glass tunnel over a shared run of lines (an information
 * highway, or the body of the Gateway). Controls set `level` and `streams`;
 * `grantEvery` calls `grant()` on a timer.
 */
export const Specimen: StoryObj<ConduitArgs> = {
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 5.5, focusY: 0.2 });
    const conduit = new Conduit(RUN);
    conduit.level = args.level;
    conduit.streams = args.streams;
    stage.add(conduit);
    let since = 0;
    stage.onTick((dt) => {
      conduit.update(dt);
      if (!args.grantEvery) return;
      since += dt;
      if (since < args.grantEvery) return;
      since = 0;
      conduit.grant();
    });
    return root;
  },
};
