import type { DroneFlight } from '../animation/DroneFlight';
import type { SceneHost } from '../stage/Stage';

/**
 * Story steps are promises that resolve on the stage clock, not wall time, so
 * they pause, slow down and test exactly like the rest of the simulation.
 */

/** Resolve after `seconds` of stage time. */
export function wait(stage: Pick<SceneHost, 'onTick'>, seconds: number): Promise<void> {
  return new Promise((resolve) => {
    let elapsed = 0;
    const untick = stage.onTick((dt) => {
      elapsed += dt;
      if (elapsed < seconds) return;
      untick();
      resolve();
    });
  });
}

/** Run a flight to completion on the stage clock. */
export function fly(stage: Pick<SceneHost, 'onTick'>, flight: DroneFlight): Promise<void> {
  return new Promise((resolve) => {
    const untick = stage.onTick((dt) => {
      flight.update(dt);
      if (!flight.done) return;
      untick();
      resolve();
    });
  });
}
