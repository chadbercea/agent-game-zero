import { type FlightOptions, PacketFlight } from '../animation/PacketFlight';
import { Packet } from '../primitives/packet/Packet';
import type { SpawnedAgent } from './spawnAgent';
import type { SceneHost } from './Stage';

export interface SentPacket {
  packet: Packet;
  /** Resolves once the packet has landed and its trail has faded, or was cancelled. */
  landed: Promise<void>;
  /** Remove the packet immediately (e.g. its sender or receiver despawned). */
  cancel: () => void;
}

/**
 * Send a packet from one agent's drone to another's. It cleans itself up
 * after landing.
 */
export function sendPacket(
  stage: SceneHost,
  from: SpawnedAgent,
  to: SpawnedAgent,
  options: FlightOptions = {},
): SentPacket {
  const packet = new Packet();
  const flight = new PacketFlight(packet, from.drone.rig.hover, to.drone.rig.hover, options);
  stage.add(packet);
  let finish = () => {};
  const landed = new Promise<void>((resolve) => {
    const untick = stage.onTick((dt) => {
      flight.update(dt);
      if (flight.done) finish();
    });
    finish = () => {
      finish = () => {};
      untick();
      packet.dispose();
      resolve();
    };
  });
  return { packet, landed, cancel: () => finish() };
}
