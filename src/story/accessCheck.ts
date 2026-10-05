import { DroneFlight, type FlightBody } from '../animation/DroneFlight';
import type { Status } from '../core/palette';
import type { GateState } from '../primitives/gate/Gate';
import type { SceneHost } from '../stage/Stage';
import { fly, wait } from './timeline';

/** The parts of a drone an access check drives. */
export interface CheckingDrone extends FlightBody {
  status: Status;
}

/** The parts of a gate an access check drives. */
export interface CheckedGate {
  state: GateState;
  /** Does this gate work as expected? A real binary for now (project decision 2). */
  works: boolean;
  position: { x: number; z: number };
}

export interface AccessCheckOptions {
  /** Seconds the gate spends thinking before it answers. */
  thinkSeconds?: number;
}

export const THINK_SECONDS = 2;

/**
 * The access check (story step 3):
 * 1. The drone flies to the gate (if it isn't already there) and floats above it.
 * 2. The gate turns yellow and thinks; the drone waits.
 * 3. The gate pops green (works) or red (doesn't). On green the drone gets to
 *    work; on red it goes Stopped at the gate, ready for a retry.
 *
 * Resolves with whether access was granted. Call it again to retry.
 */
export async function accessCheck(
  stage: Pick<SceneHost, 'onTick'>,
  drone: CheckingDrone,
  gate: CheckedGate,
  options: AccessCheckOptions = {},
): Promise<boolean> {
  const target = { x: gate.position.x, z: gate.position.z };
  const away = Math.hypot(drone.position.x - target.x, drone.position.z - target.z) > 1e-3;
  if (away) {
    drone.status = 'working';
    gate.state = 'off';
    await fly(stage, DroneFlight.to(drone, drone.position.clone().set(target.x, 0, target.z)));
  }

  drone.status = 'waiting';
  gate.state = 'thinking';
  await wait(stage, options.thinkSeconds ?? THINK_SECONDS);

  const granted = gate.works;
  gate.state = granted ? 'open' : 'denied';
  drone.status = granted ? 'working' : 'stopped';
  return granted;
}
