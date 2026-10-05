import { Group } from 'three';
import { type Arrival, ArrivalAnimator } from '../animation/ArrivalAnimator';
import { DroneAnimator } from '../animation/DroneAnimator';
import { GateAnimator } from '../animation/GateAnimator';
import type { Status } from '../core/palette';
import { Drone, type DroneOptions, SUB_AGENT_SCALE } from '../primitives/drone/Drone';
import { Gate, type GateState } from '../primitives/gate/Gate';
import { attachSignal } from './attachSignal';
import type { SceneHost } from './Stage';
import { FACE_CAMERA } from './spawnDrone';

export interface SpawnOptions extends DroneOptions {
  /** How the agent enters the scene. Defaults to instant. */
  arrival?: Arrival;
}

export interface SpawnedAgent {
  /** Root of the drone + gate pair; position and select by this. */
  unit: Group;
  drone: Drone;
  /** The gate the drone is working through (the task box, in the gate model). */
  gate: Gate;
  despawn: () => void;
}

/**
 * How a gate reads the drone over it: working = open (green), waiting = off
 * (gray, nothing happening), stopped = denied (red).
 */
export const GATE_FOR_STATUS: Record<Status, GateState> = {
  working: 'open',
  waiting: 'off',
  stopped: 'denied',
};

/**
 * A drone hovering over a gate. The drone owns status; the gate mirrors it
 * every frame, so status changes only ever go through `drone.status`.
 */
export function spawnAgent(stage: SceneHost, x: number, z: number, options: SpawnOptions = {}): SpawnedAgent {
  const unit = new Group();
  unit.position.set(x, 0, z);
  unit.rotation.y = FACE_CAMERA;

  const drone = new Drone(options);
  const gate = new Gate({ state: GATE_FOR_STATUS[drone.status] });
  if (options.subAgent) gate.scale.setScalar(SUB_AGENT_SCALE);
  unit.add(gate, drone);

  const droneAnimator = new DroneAnimator(drone);
  const gateAnimator = new GateAnimator(gate);
  stage.add(unit);
  const arrival = new ArrivalAnimator({ drone, hover: drone.rig.hover, base: gate }, options.arrival ?? { kind: 'instant' });

  const tick = (dt: number) => {
    droneAnimator.update(dt);
    gate.state = GATE_FOR_STATUS[drone.status];
    gateAnimator.update(dt);
    arrival.update(dt);
  };
  tick(0);
  const untick = stage.onTick(tick);
  // The drone ↔ gate signal link: conversation while working, one-shot on stopping, quiet while waiting.
  const detachSignal = attachSignal(stage, drone, gate);

  return {
    unit,
    drone,
    gate,
    despawn: () => {
      untick();
      detachSignal();
      drone.dispose();
      gate.dispose();
      unit.removeFromParent();
    },
  };
}
