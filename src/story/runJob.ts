import type { Drone } from '../primitives/drone/Drone';
import type { Gate } from '../primitives/gate/Gate';
import type { SceneHost } from '../stage/Stage';
import { accessCheck } from './accessCheck';
import { fanOut, workOne } from './fanOut';
import { returnHome } from './returnHome';
import { revealMap } from './revealMap';
import type { SystemMap } from './SystemMap';

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

  onStep('fan-out');
  drone.status = 'waiting';
  const crew = await fanOut(stage, drone, map);

  onStep('working');
  await Promise.all(
    crew.map(async (member, i) => {
      await workOne(stage, member, drone);
      await returnHome(stage, member, drone, map.routes[i]);
    }),
  );
  drone.status = 'waiting';
  onStep('done');
  return true;
}
