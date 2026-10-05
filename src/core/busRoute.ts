import { Vector3 } from 'three';
import { GRID } from './grid';

export type Axis = 'x' | 'z';
const other = (axis: Axis): Axis => (axis === 'x' ? 'z' : 'x');

/**
 * Circuit-board routing from one origin to many targets on the floor grid.
 *
 * Every trace is a shortest grid route (Manhattan length: |Δx| + |Δz|, plus
 * at most a small lane offset at the start), with a single turn. Traces leave
 * the origin together as a parallel bus along one axis and peel off one at a
 * time, as late as possible, toward their targets.
 *
 * How it works:
 * 1. Bus axis: the axis every trace travels the same way along, preferring
 *    the one with the longer shared run (the smallest move along it, since
 *    all traces share the bus until the first one peels off).
 * 2. Lane order: traces sorted by how soon they peel off. The first to peel
 *    takes the outermost lane on the side it turns toward, the next takes
 *    the lane beside it, and so on. That ordering means no trace ever crosses
 *    another: each one turns away across lanes that have already emptied.
 * 3. Peel-off: each trace rides its lane until it's level with its target
 *    along the bus axis, turns once, and runs straight in.
 *
 * Returns one axis-aligned polyline per target, in the order given:
 * [origin, lane start, turn, target].
 *
 * Assumes all targets lie in the same quadrant from the origin and at
 * different distances along the bus axis (as the system map lays them out).
 */
export function busRoutes(origin: Vector3, targets: Vector3[], laneSpacing = GRID, busAxis?: Axis): Vector3[][] {
  if (targets.length === 0) return [];
  const delta = (t: Vector3, axis: Axis) => t[axis] - origin[axis];

  // 1. Bus axis: as asked, else the longest shared run wins; X on a tie.
  const shared = (axis: Axis) => Math.min(...targets.map((t) => Math.abs(delta(t, axis))));
  const bus: Axis = busAxis ?? (shared('z') > shared('x') ? 'z' : 'x');
  const cross = other(bus);
  /** Which way traces turn off the bus (toward the targets along the cross axis). */
  const turnSign = Math.sign(delta(targets[0], cross)) || -1;

  // 2. Lane order: earliest peel-off (smallest move along the bus) gets the outermost lane on the turn side.
  const order = targets
    .map((t, i) => ({ i, peel: Math.abs(delta(t, bus)) }))
    .sort((a, b) => a.peel - b.peel);
  const lanes = new Map<number, number>();
  order.forEach(({ i }, k) => {
    // Lanes sit around the origin, on whole lane steps so they stay on grid lines
    // (an even count leans one lane to the far side); k = 0 is furthest toward the turn side.
    const centered = Math.floor((order.length - 1) / 2) - k;
    lanes.set(i, turnSign * centered * laneSpacing);
  });

  // 3. Ride the lane until level with the target, turn once, run straight in.
  return targets.map((target, i) => {
    const laneAt = origin[cross] + lanes.get(i)!;
    const start = origin.clone();
    start[cross] = laneAt;
    const turn = start.clone();
    turn[bus] = target[bus];
    return [origin.clone(), start, turn, target.clone()];
  });
}
