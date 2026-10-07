import type { Curve, Vector3 } from 'three';
import { NEUTRAL, STATUS_COLOR } from '../core/palette';
import { Branch } from '../primitives/branch/Branch';
import { reversed } from '../primitives/branch/gridPath';
import type { SystemKind } from '../primitives/node/emblems';
import type { SceneHost } from '../stage/Stage';
import type { TeamworkGraph } from './TeamworkGraph';
import type { TwoActScene } from './twoActs';

/** How a lit stretch of the trail reads: bright and solid. A gap is there, but dark and faint. */
const LIT_OPACITY = 0.95;
const GAP_OPACITY = 0.35;
/** The trail rides just above the lines it follows, so it reads on top of them. */
const LIFT = 0.03;

/** One stretch of a request's trail: from where it was asked for, out to one source. */
export interface TrailLeg {
  to: SystemKind;
  route: Curve<Vector3>;
}

/**
 * Every stretch from D3V1N's gate to each source of a request. A source behind
 * D3V1N's own gate is reached along its gate line. A source in the other
 * system is reached across the Teamwork Graph: out along the gate line to the
 * tool it's linked to, then along that graph link, through the secure gateway.
 */
export function trailLegs(scene: Pick<TwoActScene, 'act1' | 'act2'>, graph: TeamworkGraph, sources: readonly SystemKind[]): TrailLeg[] {
  const home = scene.act1.map;
  const homeRoute = (kind: SystemKind) => {
    const i = home.nodes.findIndex((n) => n.kind === kind);
    return i >= 0 ? home.routes[i] : undefined;
  };
  const legs: TrailLeg[] = [];
  const add = (leg: TrailLeg) => {
    if (!legs.some((l) => l.route === leg.route)) legs.push(leg);
  };
  for (const kind of sources) {
    const direct = homeRoute(kind);
    if (direct) {
      add({ to: kind, route: direct });
      continue;
    }
    // Across the graph: the first link from one of the request's home sources to this one.
    const link = graph.links.find(
      (l) => (l.to.kind === kind && homeRoute(l.from.kind)) || (l.from.kind === kind && homeRoute(l.to.kind)),
    );
    if (!link) continue;
    const partner = link.to.kind === kind ? link.from.kind : link.to.kind;
    add({ to: partner, route: homeRoute(partner)! });
    add({ to: kind, route: link.to.kind === kind ? link.route : reversed(link.route) });
  }
  return legs;
}

/**
 * The trail: one request's path through the grid, drawn over the lines it
 * followed. Lit legs are bright green; gaps (links the request never had)
 * stay dark. `show` replaces whatever trail is up; `hide` clears it.
 */
export class Trail {
  private branches: Branch[] = [];

  constructor(private readonly stage: SceneHost) {}

  get visible(): boolean {
    return this.branches.length > 0;
  }

  /** How many legs are lit and how many are gaps, right now. */
  get counts(): { lit: number; gaps: number } {
    const lit = this.branches.filter((b) => b.userData.lit).length;
    return { lit, gaps: this.branches.length - lit };
  }

  show(lit: readonly TrailLeg[], gaps: readonly TrailLeg[] = []): void {
    this.hide();
    const draw = (leg: TrailLeg, on: boolean) => {
      const branch = new Branch(leg.route, on ? STATUS_COLOR.working : NEUTRAL.graphite);
      branch.position.y = LIFT;
      branch.drawn = 1;
      branch.material.opacity = on ? LIT_OPACITY : GAP_OPACITY;
      branch.userData.lit = on;
      this.stage.add(branch);
      this.branches.push(branch);
    };
    for (const leg of gaps) draw(leg, false);
    for (const leg of lit) draw(leg, true);
  }

  hide(): void {
    for (const b of this.branches) b.dispose();
    this.branches = [];
  }
}
