import type { Meta, StoryObj } from '@storybook/html-vite';
import { Object3D } from 'three';
import { PacketFlight } from '../../animation/PacketFlight';
import { specimenStage } from '../../stage/specimen';
import { Pad } from '../pad/Pad';
import { Packet } from './Packet';

interface PacketArgs {
  /** PacketFlight `speed`: world units per second along the route. */
  speed: number;
  /** PacketFlight `lift`: how high the arc rises between the two ends. */
  lift: number;
}

const meta: Meta<PacketArgs> = {
  title: 'Primitives/Packet',
  parameters: { layout: 'fullscreen' },
  argTypes: {
    speed: { control: { type: 'range', min: 0.5, max: 8, step: 0.25 } },
    lift: { control: { type: 'range', min: 0, max: 3, step: 0.1 } },
  },
  args: { speed: 3.2, lift: 0.9 },
};
export default meta;

/**
 * Packet: a small cube (`cube`) and the dotted trail of its route (`trail`),
 * placed in world space by whatever moves it. Here a PacketFlight carries one
 * from one pad to the other and back, on loop; the controls set the flight's
 * `speed` and `lift`.
 */
export const Specimen: StoryObj<PacketArgs> = {
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 5, focusY: 0.4 });
    const ends = [-1.5, 1.5].map((x) => {
      const pad = new Pad({ width: 0.8, depth: 0.8 });
      pad.position.set(x, 0, -x);
      const at = new Object3D();
      at.position.set(x, 0.4, -x);
      stage.add(pad, at);
      return at;
    });
    let leg = 0;
    let packet: Packet;
    let flight: PacketFlight;
    const launch = () => {
      packet = new Packet();
      stage.add(packet);
      flight = new PacketFlight(packet, ends[leg % 2], ends[(leg + 1) % 2], { speed: args.speed, lift: args.lift });
      leg++;
    };
    launch();
    stage.onTick((dt) => {
      flight.update(dt);
      if (!flight.done) return;
      packet.dispose();
      launch();
    });
    return root;
  },
};
