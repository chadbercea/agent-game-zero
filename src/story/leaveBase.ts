import type { Vector3 } from 'three';
import { DroneFlight } from '../animation/DroneFlight';
import type { Drone } from '../primitives/drone/Drone';
import type { Gate } from '../primitives/gate/Gate';
import type { AttachedSignal } from '../stage/attachSignal';
import type { SceneHost } from '../stage/Stage';
import { fly } from './timeline';

/** Upper bound on waiting for the dots to clear before moving. */
const MAX_SETTLE = 1;

/**
 * Leave a gate cleanly: close the gate (which ends the conversation), wait
 * until the signal's dots have cleared, and only then fly away. The drone
 * never moves with dots still playing beneath it.
 */
export async function leaveBase(
  stage: SceneHost,
  scene: { drone: Drone; gate: Gate; signal: AttachedSignal },
  to: Vector3,
): Promise<void> {
  const { drone, gate, signal } = scene;
  gate.state = 'off';
  await new Promise<void>((resolve) => {
    let waited = 0;
    const untick = stage.onTick((dt) => {
      waited += dt;
      if (!signal.quiet() && waited < MAX_SETTLE) return;
      untick();
      resolve();
    });
  });
  drone.status = 'working';
  await fly(stage, DroneFlight.to(drone, to));
  drone.status = 'waiting';
}
