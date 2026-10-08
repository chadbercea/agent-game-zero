import type { Meta, StoryObj } from '@storybook/html-vite';
import type { SharedRun } from '../../core/sharedRuns';
import { specimenStage } from '../../stage/specimen';
import { Gateway } from './Gateway';

interface GatewayArgs {
  /** `built` (0–1): how far the glass tunnel has scaled up. */
  built: number;
  /** `lockDrop` (0–1): how far the lock has come down to its float. */
  lockDrop: number;
  /** `conduit.streams` (0–1): the data flowing inside the tunnel. */
  streams: number;
  /** Calls `grant()` this often, in seconds (0 = never): the tunnel and lock flash green. */
  grantEvery: number;
}

const unit = { control: { type: 'range', min: 0, max: 1, step: 0.01 } } as const;

const meta: Meta<GatewayArgs> = {
  title: 'Primitives/Gateway',
  parameters: { layout: 'fullscreen' },
  argTypes: {
    built: unit,
    lockDrop: unit,
    streams: unit,
    grantEvery: { control: { type: 'range', min: 0, max: 5, step: 0.5 } },
  },
  args: { built: 1, lockDrop: 1, streams: 1, grantEvery: 2 },
};
export default meta;

/** Three squares long, one lane wide, centered on the origin. */
const RUN: SharedRun = { along: 'x', from: -1.5, to: 1.5, low: -0.5, high: 0.5 };

/**
 * Gateway: the secure crossing between systems, a glass Conduit with a Lock
 * floating over its middle. Controls set `built`, `lockDrop` and
 * `conduit.streams`; `grantEvery` calls `grant()` on a timer.
 */
export const Specimen: StoryObj<GatewayArgs> = {
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 5, focusY: 0.3 });
    const gateway = new Gateway(RUN);
    gateway.dropFrom.set(0, 2.5, 0);
    gateway.built = args.built;
    gateway.lockDrop = args.lockDrop;
    gateway.conduit.streams = args.streams;
    stage.add(gateway);
    let since = 0;
    stage.onTick((dt) => {
      gateway.update(dt);
      if (!args.grantEvery) return;
      since += dt;
      if (since < args.grantEvery) return;
      since = 0;
      gateway.grant();
    });
    return root;
  },
};
