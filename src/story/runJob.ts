import type { Drone } from '../primitives/drone/Drone';
import type { Gate } from '../primitives/gate/Gate';
import type { SceneHost } from '../stage/Stage';
import { WorkColumnAnimator } from '../animation/WorkColumnAnimator';
import { WorkColumn } from '../primitives/column/WorkColumn';
import { FACE_CAMERA } from '../stage/spawnDrone';
import { accessCheck } from './accessCheck';
import { fanOut, workOne } from './fanOut';
import { returnHome } from './returnHome';
import { revealMap } from './revealMap';
import type { SystemMap } from './SystemMap';
import { wait } from './timeline';

/** Where the working column's dotted line meets the drone: just under its body. */
const TETHER_ATTACH = 0.42;

export type JobStep = 'access' | 'denied' | 'mapping' | 'fan-out' | 'working' | 'done';

export const JOB_STEP_CAPTION: Record<JobStep, string> = {
  access: 'Checking access…',
  denied: 'Access denied. The system isn’t working as expected.',
  mapping: 'Access granted. Mapping the system…',
  'fan-out': 'Spawning sub-agents…',
  working: 'Sub-agents working: report, branch + git init, read',
  done: 'Job done. Work delivered to D3V1N.',
};

/**
 * The whole agent story, start to finish: the drone checks access at the
 * gate; on green the system maps out, sub-agents fan out to the nodes, work,
 * and come home with their work products. Resolves with whether access was
 * granted; on red the drone is left Stopped at the gate (call again to retry).
 */
export async function runJob(
  stage: SceneHost,
  scene: { drone: Drone; gate: Gate; map: SystemMap },
  onStep: (step: JobStep) => void = () => {},
): Promise<boolean> {
  const { drone, gate, map } = scene;
  onStep('access');
  if (!(await accessCheck(stage, drone, gate))) {
    onStep('denied');
    return false;
  }
  onStep('mapping');
  await revealMap(stage, map);

  // The parent orchestrates: green, with its working column (spinning cube,
  // orbit arrows, dotted line to the gate) until the last sub-agent is home.
  onStep('fan-out');
  drone.status = 'working';
  const column = showWorkColumn(stage, drone);
  const crew = await fanOut(stage, drone, map);

  onStep('working');
  await Promise.all(
    crew.map(async (member, i) => {
      await workOne(stage, member);
      await returnHome(stage, member, drone, map.routes[i]);
    }),
  );
  drone.status = 'waiting';
  await column.hide();
  onStep('done');
  return true;
}

/** Put a working column under a drone, tracking its height, until hidden. */
export function showWorkColumn(stage: SceneHost, drone: Drone): { hide: () => Promise<void> } {
  const column = new WorkColumn();
  column.position.set(drone.position.x, 0, drone.position.z);
  column.rotation.y = FACE_CAMERA;
  const animator = new WorkColumnAnimator(column);
  stage.add(column);
  const untick = stage.onTick((dt) => {
    column.tetherTop = drone.position.y + drone.rig.hover.position.y - TETHER_ATTACH;
    animator.update(dt);
  });
  return {
    hide: async () => {
      animator.shown = false;
      await wait(stage, 0.6);
      untick();
      column.dispose();
    },
  };
}
