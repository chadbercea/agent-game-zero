import { type Curve, CurvePath, LineCurve3, type Vector3 } from 'three';
import { DroneFlight } from '../animation/DroneFlight';
import { type Drone, HOVER_HEIGHT, SUB_AGENT_SCALE } from '../primitives/drone/Drone';
import type { SystemKind } from '../primitives/node/emblems';
import { type SpawnedDrone, spawnDrone } from '../stage/spawnDrone';
import type { SceneHost } from '../stage/Stage';
import { D3V1N_REACH, linkRoute, type ReworkScene } from './rework';
import type { TeamworkGraph } from './TeamworkGraph';
import { fly, tween } from './timeline';

/** A sub-agent buds off its parent this small and grows to full size on the way out. */
const BUD_SCALE = 0.25;

/**
 * Bud a sub-agent off `parent` and fly it out along `route` to `spot` (a
 * last hop from the route's end, if they differ), growing as it goes. It
 * arrives working. Resolves with the sub-agent.
 */
export async function budOut(
  stage: SceneHost,
  parent: Drone,
  name: string,
  route: Curve<Vector3>,
  spot: Vector3,
  speed = 4.2,
): Promise<SpawnedDrone> {
  const sub = spawnDrone(stage, parent.position.x, parent.position.z, {
    name,
    lineage: parent.lineage,
    subAgent: true,
    status: 'working',
  });
  const path = new CurvePath<Vector3>();
  path.add(route);
  const end = route.getPoint(1);
  if (end.distanceTo(spot) > 1e-3) path.add(new LineCurve3(end, spot.clone()));
  const budHover = HOVER_HEIGHT * SUB_AGENT_SCALE * BUD_SCALE;
  await Promise.all([
    fly(stage, DroneFlight.along(sub.drone, path, { fromHeight: HOVER_HEIGHT - budHover, speed })),
    tween(stage, 0.8, (t) => sub.drone.scale.setScalar(SUB_AGENT_SCALE * (BUD_SCALE + (1 - BUD_SCALE) * t))),
  ]);
  return sub;
}

/** The tools along the shortest hop-by-hop path between two tools on the graph (both ends included), or null. */
export function graphPathKinds(graph: TeamworkGraph, from: SystemKind, to: SystemKind): SystemKind[] | null {
  const came = new Map<SystemKind, SystemKind | null>([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const at = queue.shift()!;
    if (at === to) break;
    for (const l of graph.links) {
      const next = l.from.kind === at ? l.to.kind : l.to.kind === at ? l.from.kind : null;
      if (next && !came.has(next)) {
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

/**
 * D3V1N's way from its spot to any tool once Rovo has connected it: straight
 * along its own line to a tool it can reach, otherwise along its line to Jira
 * (through the secure gateway) and on along the graph.
 */
export function viaGateway(scene: ReworkScene, to: SystemKind): Curve<Vector3> {
  const direct = scene.reach[to];
  if (direct && D3V1N_REACH.includes(to)) return direct.route;
  const path = new CurvePath<Vector3>();
  path.add(scene.reach.jira!.route);
  const hops = graphPathKinds(scene.graph, 'jira', to);
  if (hops && hops.length > 1) path.add(linkRoute(scene.graph, ...hops));
  return path;
}
