import { type Curve, Vector3 } from 'three';
import { BEND_RADIUS, NODE_FOOTPRINT } from '../core/grid';
import { NEUTRAL } from '../core/palette';
import { gridRoute } from '../core/scatter';
import { Branch } from '../primitives/branch/Branch';
import { reversed, roundedPath, trimPolyline } from '../primitives/branch/gridPath';
import { SystemNode } from '../primitives/node/SystemNode';
import type { SceneHost } from '../stage/Stage';
import { shoot } from './beam';
import { tween } from './timeline';

/** A tertiary node is this much the size of its secondary: clearly smaller, clearly under it. */
export const TERTIARY_SCALE = 0.55;
/**
 * Where tertiaries can sit around their secondary, on the grid a short hop
 * off, in order of preference: beside it on screen first (left, right), so
 * their agents don't stack over the tool's, then the diagonals, and last
 * straight in front or behind.
 */
const OFFSETS = [
  [-1, 1],
  [1, -1],
  [-1.5, 0],
  [0, -1.5],
  [1.5, 0],
  [0, 1.5],
  [1, 1],
  [-1, -1],
].map(([x, z]) => new Vector3(x, 0, z));
/** How much room a tertiary needs from anything else on the floor. */
const CLEARANCE = 1.2;
/** Seconds between pieces of work a tertiary feeds into its secondary. */
const FEED_EVERY = 1.1;
const FEED_SPEED = 3;
const GROW_SECONDS = 0.5;

/** An agent's place at a tool: over the tool itself, or over a tertiary node of its own. */
export interface Claim {
  /** Where the agent hovers and works (floor point). */
  spot: Vector3;
  /** The tertiary node this agent works, if the tool was already taken. */
  tertiary: SystemNode | null;
  /** The agent's work there is done: a tertiary shrinks away. Safe to call twice. */
  release: () => void;
}

/**
 * Tertiary nodes. The first agent at a tool works the tool itself (the
 * secondary node). Every agent after it gets a tertiary node of its own: a
 * smaller node of the same kind buds off the tool on a free spot nearby,
 * joined to it by a short trace, and its work keeps flowing along the trace
 * into the tool. When that agent's work ends, its tertiary shrinks away and
 * the trace goes with it. Spots are picked in a fixed order, so the same
 * claims always put tertiaries in the same places.
 */
export class Tertiaries {
  private readonly agents = new Map<SystemNode, number>();
  private readonly live = new Set<{ node: SystemNode; remove: () => void }>();

  /** `keepClear()`: where everything else on the floor is right now (tools, gates, ...), for placing tertiaries. */
  constructor(
    private readonly stage: SceneHost,
    private readonly keepClear: () => Vector3[] = () => [],
  ) {}

  /** How many tertiaries are up now. */
  get count(): number {
    return this.live.size;
  }

  /** An agent arrives to work at `node`: its place there. */
  claim(node: SystemNode): Claim {
    const n = this.agents.get(node) ?? 0;
    this.agents.set(node, n + 1);
    let released = false;
    const leave = () => {
      if (released) return false;
      released = true;
      this.agents.set(node, Math.max(0, (this.agents.get(node) ?? 1) - 1));
      return true;
    };
    if (n === 0) return { spot: node.position.clone(), tertiary: null, release: () => void leave() };
    const spot = this.freeSpot(node.position);
    const { tertiary, remove } = this.bud(node, spot);
    return {
      spot,
      tertiary,
      release: () => {
        if (leave()) remove();
      },
    };
  }

  /** Everything off the grid at once (resetting the scene). */
  clear(): void {
    for (const t of [...this.live]) t.remove();
    this.agents.clear();
  }

  private freeSpot(center: Vector3): Vector3 {
    const taken = [...this.keepClear(), ...[...this.live].map((t) => t.node.position)];
    const clear = (p: Vector3) => taken.every((q) => Math.hypot(p.x - q.x, p.z - q.z) >= CLEARANCE);
    for (const offset of OFFSETS) {
      const p = center.clone().add(offset);
      if (clear(p)) return p;
    }
    // Crowded all round: the furthest-from-everything of the offsets.
    const room = (p: Vector3) => Math.min(...taken.map((q) => Math.hypot(p.x - q.x, p.z - q.z)));
    return OFFSETS.map((o) => center.clone().add(o)).sort((a, b) => room(b) - room(a))[0];
  }

  /** A tertiary buds off `secondary` at `spot`: its trace draws out, it grows, its light comes on, and it starts feeding. */
  private bud(secondary: SystemNode, spot: Vector3): { tertiary: SystemNode; remove: () => void } {
    const { stage } = this;
    const tertiary = new SystemNode({ kind: secondary.kind, showLabel: false });
    tertiary.position.copy(spot);
    tertiary.scale.setScalar(0.001);
    tertiary.light = 'working';
    // The trace runs from the secondary out to the tertiary, pad edge to pad edge.
    const line: Curve<Vector3> = roundedPath(
      trimPolyline(gridRoute(secondary.position, spot), NODE_FOOTPRINT / 2, (NODE_FOOTPRINT / 2) * TERTIARY_SCALE),
      BEND_RADIUS,
    );
    const trace = new Branch(line, NEUTRAL.packet);
    trace.drawn = 0;
    stage.add(trace, tertiary);
    let alive = true;
    void tween(stage, GROW_SECONDS, (t) => alive && (trace.drawn = t)).then(() =>
      tween(stage, GROW_SECONDS, (t) => alive && tertiary.scale.setScalar(Math.max(0.001, TERTIARY_SCALE * easeOutBack(t)))),
    );
    // Its work flows along the trace into the secondary.
    const feed = reversed(line);
    let since = FEED_EVERY * 0.5;
    const untick = stage.onTick((dt) => {
      if (tertiary.scale.x < TERTIARY_SCALE * 0.9) return;
      since += dt;
      if (since < FEED_EVERY) return;
      since = 0;
      void shoot(stage, feed, FEED_SPEED, undefined, secondary.kind);
    });
    const entry = {
      node: tertiary,
      remove: () => {
        if (!alive) return;
        alive = false;
        untick();
        this.live.delete(entry);
        const from = tertiary.scale.x;
        void tween(stage, GROW_SECONDS, (t) => {
          tertiary.scale.setScalar(Math.max(0.001, from * (1 - t)));
          trace.drawn = 1 - t;
        }).then(() => {
          tertiary.removeFromParent();
          tertiary.dispose();
          trace.removeFromParent();
          trace.dispose();
        });
      },
    };
    this.live.add(entry);
    return { tertiary, remove: entry.remove };
  }
}

function easeOutBack(t: number): number {
  const c = 1.6;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}
