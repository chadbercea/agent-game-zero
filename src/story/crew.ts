import { CurvePath, type Vector3 } from 'three';
import { reversed } from '../primitives/branch/gridPath';
import { DroneFlight } from '../animation/DroneFlight';
import { type Drone, HOVER_HEIGHT, SUB_AGENT_SCALE } from '../primitives/drone/Drone';
import type { SystemKind } from '../primitives/node/emblems';
import { type SpawnedDrone, spawnDrone } from '../stage/spawnDrone';
import type { Spawner } from './roster';
import type { SceneHost } from '../stage/Stage';
import type { TeamworkGraph } from './TeamworkGraph';
import { fly, tween } from './timeline';

/** A sub-agent buds off its parent this small and grows to full size on the way out. */
const BUD_SCALE = 0.25;

/**
 * Bud a sub-agent off `parent` and fly it straight out to `spot`, growing as
 * it goes (agents never ride lines: ILI-969). It arrives working. Resolves
 * with the sub-agent.
 */
export async function budOut(
  stage: SceneHost,
  parent: Drone,
  name: string,
  spot: Vector3,
  speed = 4.2,
  /** Runs every frame of the flight out (e.g. to see it through a tunnel). */
  watch: (drone: Drone) => void = () => {},
  /** How it comes into being (the story's roster, so it's in the sequence). */
  spawn: Spawner = spawnDrone,
): Promise<SpawnedDrone> {
  const sub = spawn(stage, parent.position.x, parent.position.z, {
    name,
    lineage: parent.lineage,
    subAgent: true,
    status: 'working',
  });
  const budHover = HOVER_HEIGHT * SUB_AGENT_SCALE * BUD_SCALE;
  const untick = stage.onTick(() => watch(sub.drone));
  await Promise.all([
    fly(stage, DroneFlight.to(sub.drone, spot, { fromHeight: HOVER_HEIGHT - budHover, speed })),
    tween(stage, 0.8, (t) => sub.drone.scale.setScalar(SUB_AGENT_SCALE * (BUD_SCALE + (1 - BUD_SCALE) * t))),
  ]);
  untick();
  return sub;
}

/** The tools along the shortest hop-by-hop path between two tools on the graph (both ends included), or null. */
export function graphPathKinds(
  graph: TeamworkGraph,
  from: SystemKind,
  to: SystemKind,
  /** Only through these tools (e.g. the ones on the grid so far). */
  among: (kind: SystemKind) => boolean = () => true,
): SystemKind[] | null {
  const came = new Map<SystemKind, SystemKind | null>([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const at = queue.shift()!;
    if (at === to) break;
    for (const l of graph.links) {
      const next = l.from.kind === at ? l.to.kind : l.to.kind === at ? l.from.kind : null;
      if (next && !came.has(next) && among(next)) {
        came.set(next, at);
        queue.push(next);
      }
    }
  }
  if (!came.has(to)) return null;
  const path: SystemKind[] = [];
  for (let k: SystemKind | null = to; k; k = came.get(k) ?? null) path.unshift(k);
  return path;
}

/** The graph's route through these tools in order, each link turned to run the right way (what work products ride). */
export function linkRoute(graph: TeamworkGraph, ...kinds: SystemKind[]): CurvePath<Vector3> {
  const path = new CurvePath<Vector3>();
  for (let i = 1; i < kinds.length; i++) {
    const [a, b] = [kinds[i - 1], kinds[i]];
    const link = graph.links.find((l) => (l.from.kind === a && l.to.kind === b) || (l.from.kind === b && l.to.kind === a));
    if (!link) throw new Error(`linkRoute: no graph link between ${a} and ${b}`);
    path.add(link.from.kind === a ? link.route : reversed(link.route));
  }
  return path;
}
