import { GateAnimator } from '../animation/GateAnimator';
import type { Drone } from '../primitives/drone/Drone';
import { Gate } from '../primitives/gate/Gate';
import { ATLASSIAN_KINDS, JOB_KINDS } from '../primitives/node/emblems';
import { type AttachedSignal, attachSignal } from '../stage/attachSignal';
import { spawnDrone } from '../stage/spawnDrone';
import type { SceneHost } from '../stage/Stage';
import { accessCheck } from './accessCheck';
import { type CrewMember, fanOut, keepWorking, workOne } from './fanOut';
import { ACT1_GATE, ACT1_MAP, ATLASSIAN_GATE, ATLASSIAN_MAP, HOME } from './layout';
import { leaveBase } from './leaveBase';
import { revealMap } from './revealMap';
import { SystemMap } from './SystemMap';

/** One gate's system: the gate, its map, and the parent's signal link to it. */
export interface GateSystem {
  gate: Gate;
  map: SystemMap;
  signal: AttachedSignal;
}

export interface TwoActScene {
  drone: Drone;
  act1: GateSystem;
  act2: GateSystem;
}

/** A crew that keeps working, and how to stop each member's loop. */
export interface WorkingCrew {
  crew: CrewMember[];
  stop: () => void;
}

/**
 * Act 1: access at the first gate, its system maps out, and three sub-agents
 * fan out and do their jobs in parallel. Unlike the one-act story they don't
 * come home: each finishes its first job, then keeps working (the job loops),
 * all green. Resolves with the working crew, or null if access is denied.
 */
export async function act1(stage: SceneHost, scene: TwoActScene): Promise<WorkingCrew | null> {
  const { drone, act1: system } = scene;
  if (!(await accessCheck(stage, drone, system.gate))) return null;
  await revealMap(stage, system.map);
  drone.status = 'working';
  const crew = await fanOut(stage, drone, system.map);
  await Promise.all(crew.map((member) => workOne(stage, member)));
  const stops = crew.map((member) => keepWorking(stage, member));
  return { crew, stop: () => stops.forEach((stop) => stop()) };
}

/**
 * The transition: with the Act 1 crew still working and its gate still green,
 * D3V1N mutes its own link (the dots clear first), flies across the grid to the
 * Atlassian gate, and authenticates. Resolves with whether access was granted.
 */
export async function toAtlassian(stage: SceneHost, scene: TwoActScene): Promise<boolean> {
  const { drone, act1: from, act2: to } = scene;
  await leaveBase(stage, { drone, gate: from.gate, signal: from.signal }, ATLASSIAN_GATE, { keepOpen: true });
  return accessCheck(stage, drone, to.gate);
}

/** Build the two-gate scene: both gates and maps on the grid, D3V1N at home, linked to both gates. */
export function twoActScene(stage: SceneHost): TwoActScene {
  const gateAt = (position: typeof ACT1_GATE) => {
    const gate = new Gate();
    gate.position.copy(position);
    const animator = new GateAnimator(gate);
    stage.add(gate);
    stage.onTick((dt) => animator.update(dt));
    return gate;
  };
  const { drone } = spawnDrone(stage, HOME.x, HOME.z, { name: 'D3V1N', showLabel: true, status: 'waiting' });
  const gate1 = gateAt(ACT1_GATE);
  const gate2 = gateAt(ATLASSIAN_GATE);
  return {
    drone,
    act1: { gate: gate1, map: new SystemMap(stage, gate1, JOB_KINDS, ACT1_MAP), signal: attachSignal(stage, drone, gate1) },
    act2: {
      gate: gate2,
      map: new SystemMap(stage, gate2, ATLASSIAN_KINDS, ATLASSIAN_MAP),
      signal: attachSignal(stage, drone, gate2),
    },
  };
}

