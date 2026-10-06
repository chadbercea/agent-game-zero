import { type Curve, MathUtils, type Object3D, type Vector3 } from 'three';
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

/** Packets shot along a branch run just above the line, fast. */
export const SHOT_SPEED = 6.5;
const SHOT_HEIGHT = 0.16;

/**
 * Shoot one packet along a floor path (a branch, from its node to the gate),
 * riding just above the line, and resolve when it lands. It pops in at the
 * start and shrinks into the far end.
 */
export function shoot(stage: SceneHost, path: Curve<Vector3>, speed = SHOT_SPEED): Promise<void> {
  const packet = new Packet();
  packet.trail.visible = false;
  stage.add(packet);
  const length = path.getLength();
  let travelled = 0;
  return new Promise((resolve) => {
    const untick = stage.onTick((dt) => {
      travelled = Math.min(length, travelled + speed * dt);
      const t = travelled / length;
      path.getPointAt(t, packet.cube.position);
      packet.cube.position.y = SHOT_HEIGHT;
      packet.cube.rotation.y += dt * 6;
      const pop = Math.min(1, t / 0.08) * (1 - MathUtils.smoothstep(t, 0.9, 1));
      packet.cube.scale.setScalar(Math.max(0.001, pop * 0.8));
      if (t < 1) return;
      untick();
      packet.dispose();
      resolve();
    });
  });
}
