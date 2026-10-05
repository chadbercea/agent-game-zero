import type { Object3D } from 'three';
import { PacketFlight } from '../animation/PacketFlight';
import { Packet } from '../primitives/packet/Packet';
import type { SceneHost } from '../stage/Stage';

/**
 * Send one packet between two objects (drone hover points) and resolve when
 * it lands. Trails stay hidden: lines are never persistent in Runtime.
 */
export function beam(stage: SceneHost, from: Object3D, to: Object3D): Promise<void> {
  const packet = new Packet();
  packet.trail.visible = false;
  const flight = new PacketFlight(packet, from, to);
  stage.add(packet);
  return new Promise((resolve) => {
    const untick = stage.onTick((dt) => {
      flight.update(dt);
      if (!flight.done) return;
      untick();
      packet.dispose();
      resolve();
    });
  });
}
