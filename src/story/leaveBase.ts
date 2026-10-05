import type { Vector3 } from 'three';
import { DroneFlight } from '../animation/DroneFlight';
import type { Drone } from '../primitives/drone/Drone';
import type { Gate } from '../primitives/gate/Gate';
import type { AttachedSignal } from '../stage/attachSignal';
import type { SceneHost } from '../stage/Stage';
import { fly } from './timeline';

/** Upper bound on waiting for the dots to clear before moving. */
const MAX_SETTLE = 1;

export interface LeaveOptions {
  /**
   * Leave the gate open and green behind you (e.g. a crew is still working
   * through it). Only the drone's own link is silenced. Default: close it.
   */
  keepOpen?: boolean;
  /** Status to hold during and after the flight. Default: working while flying, waiting on arrival. */
  stayWorking?: boolean;
}

/**
 * Leave a gate cleanly: end the conversation (close the gate, or with
 * `keepOpen` just mute the drone's link), wait until the signal's dots have
 * cleared, and only then fly away. The drone never moves with dots still
 * playing beneath it.
 */
export async function leaveBase(
  stage: SceneHost,
  scene: { drone: Drone; gate: Gate; signal: AttachedSignal },
  to: Vector3,
  options: LeaveOptions = {},
): Promise<void> {
  const { drone, gate, signal } = scene;
  if (options.keepOpen) signal.mute(true);
  else gate.state = 'off';
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
  // Off the old base now; its link would stay quiet anyway, so lift the mute.
  signal.mute(false);
  if (!options.stayWorking) drone.status = 'waiting';
}
