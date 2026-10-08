import type { Meta, StoryObj } from '@storybook/html-vite';
import type { SharedRun } from '../../core/sharedRuns';
import { specimenStage } from '../../stage/specimen';
import { Vector3 } from 'three';
import { DroneFlight } from '../../animation/DroneFlight';
import { spawnDrone } from '../../stage/spawnDrone';
import { fly, wait } from '../../story/timeline';
import { GATEWAY_SHAKE, Gateway } from './Gateway';

interface GatewayArgs {
  /** `built` (0–1): how far the glass tunnel has scaled up. */
  built: number;
  /** `lockDrop` (0–1): how far the lock has come down to its float. */
  lockDrop: number;
  /** `conduit.streams` (0–1): the data flowing inside the tunnel. */
  streams: number;
  /** Calls `grant()` this often, in seconds (0 = never): the tunnel and lock flash green, and it shakes. */
  grantEvery: number;
  /** The entry shake (`gateway.shake`): radians of swing, swings per second, and how fast it dies away. */
  shakeAmplitude: number;
  shakeFrequency: number;
  shakeDamping: number;
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
    shakeAmplitude: { control: { type: 'range', min: 0, max: 0.8, step: 0.01 } },
    shakeFrequency: { control: { type: 'range', min: 0.2, max: 6, step: 0.1 } },
    shakeDamping: { control: { type: 'range', min: 0.5, max: 10, step: 0.1 } },
  },
  args: {
    built: 1,
    lockDrop: 1,
    streams: 1,
    grantEvery: 2,
    shakeAmplitude: GATEWAY_SHAKE.amplitude,
    shakeFrequency: GATEWAY_SHAKE.frequency,
    shakeDamping: GATEWAY_SHAKE.damping,
  },
};
export default meta;

/** Three squares long, one lane wide, centered on the origin. */
const RUN: SharedRun = { along: 'x', from: -1.5, to: 1.5, low: -0.5, high: 0.5 };

/**
 * Gateway: the secure crossing between systems, a glass Conduit with a Lock
 * floating over its middle. Controls set `built`, `lockDrop` and
 * `conduit.streams`; `grantEvery` calls `grant()` on a timer; the shake
 * controls tune how the lock sways when something enters.
 */
export const Specimen: StoryObj<GatewayArgs> = {
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 5, focusY: 0.3 });
    const gateway = new Gateway(RUN);
    gateway.dropFrom.set(0, 2.5, 0);
    gateway.built = args.built;
    gateway.lockDrop = args.lockDrop;
    gateway.conduit.streams = args.streams;
    gateway.shake = { amplitude: args.shakeAmplitude, frequency: args.shakeFrequency, damping: args.shakeDamping };
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

/**
 * Something entering, on loop, at the restrained default shake (ILI-976): a
 * sub-agent flies through the tube; as it enters, the tube flashes green and
 * the lock gives a small sway and settles. The data keeps flowing. No captions.
 */
export const Entering: StoryObj<GatewayArgs> = {
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 5, focusY: 0.6 });
    const gateway = new Gateway(RUN);
    gateway.built = gateway.lockDrop = 1;
    gateway.conduit.streams = 1;
    gateway.shake = { amplitude: args.shakeAmplitude, frequency: args.shakeFrequency, damping: args.shakeDamping };
    stage.add(gateway);
    stage.onTick((dt) => gateway.update(dt));
    const { drone } = spawnDrone(stage, -3, 0, { name: 'Rovo.1', lineage: 'cyan', subAgent: true, status: 'working' });
    let inside = false;
    stage.onTick(() => {
      const now = Math.abs(drone.position.x) <= 1.5 && Math.abs(drone.position.z) <= 0.5;
      if (now && !inside) gateway.grant();
      inside = now;
    });
    void (async () => {
      for (;;) {
        await fly(stage, DroneFlight.to(drone, new Vector3(3, 0, 0), { speed: 2.4 }));
        await wait(stage, 1);
        await fly(stage, DroneFlight.to(drone, new Vector3(-3, 0, 0), { speed: 2.4 }));
        await wait(stage, 1);
      }
    })();
    return root;
  },
};
