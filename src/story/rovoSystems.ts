import { Vector3 } from 'three';
import { NODE_FOOTPRINT } from '../core/grid';
import type { SystemKind } from '../primitives/node/emblems';
import { SystemNode } from '../primitives/node/SystemNode';
import type { SceneHost } from '../stage/Stage';
import type { JiraHub } from './jiraHub';
import { isTwg } from './rovoTasks';
import { tween } from './timeline';

/** One system on the grid: its node, how many open tasks are using it, and whether it stays. */
export interface PlacedSystem {
  readonly kind: SystemKind;
  readonly node: SystemNode;
  /** Teamwork Graph apps stay once called; third-party tools go when no open task needs them. */
  readonly permanent: boolean;
  /** The id of its Graph Line to Jira (one per time it comes up). */
  readonly tie: string;
  users: number;
}

/**
 * The systems on Rovo's grid. Jira is there from the start (the hub). Any
 * other system comes up the first time a task calls it: a Graph Line draws
 * out from Jira to its place, then the node grows in at the line's end.
 * Teamwork Graph apps then stay; a third-party tool goes again (it folds
 * away, then its line draws back) once no open task still needs it.
 */
export class SystemsOnGrid {
  readonly placed = new Map<SystemKind, PlacedSystem>();
  private readonly arriving = new Map<SystemKind, Promise<PlacedSystem>>();
  private ups = 0;

  constructor(
    private readonly stage: SceneHost,
    private readonly hub: JiraHub,
    /** Where each system stands on the grid. */
    readonly places: Partial<Record<SystemKind, Vector3>>,
    /** The side each system's Graph Line comes in on, where it matters (a grid direction from the node). */
    private readonly arrive: Partial<Record<SystemKind, Vector3>> = {},
  ) {}

  /** A task needs `kind`: bring it up if it isn't (and tie it to Jira), and count the task as a user. */
  async call(kind: SystemKind): Promise<PlacedSystem> {
    if (kind === 'jira') return this.jiraSystem();
    const up = this.placed.get(kind) ?? (await (this.arriving.get(kind) ?? this.bringUp(kind)));
    up.users++;
    return up;
  }

  /** The task is done with `kind`. A third-party tool nobody needs any more goes. */
  async release(kind: SystemKind): Promise<void> {
    const up = this.placed.get(kind);
    if (!up || kind === 'jira') return;
    up.users = Math.max(0, up.users - 1);
    if (up.permanent || up.users > 0) return;
    this.placed.delete(kind);
    const { node } = up;
    await tween(this.stage, 0.4, (t) => {
      node.scale.setScalar(Math.max(0.001, 1 - t));
      node.labelOpacity = 1 - t;
    });
    node.dispose();
    await this.hub.untie(up.tie);
  }

  /** Every system's position on the grid, for routing lines around them. */
  positions(): Vector3[] {
    return [...this.placed.values()].map((p) => p.node.position);
  }

  private async bringUp(kind: SystemKind): Promise<PlacedSystem> {
    const promise = (async () => {
      const at = this.places[kind];
      if (!at) throw new Error(`SystemsOnGrid: no place for ${kind}`);
      // The line draws out from Jira first; then the node appears at its end.
      const tie = `system:${kind}:${++this.ups}`;
      await this.hub.tie(tie, at, this.arrive[kind], NODE_FOOTPRINT / 2 + 0.1);
      const node = new SystemNode({ kind });
      node.position.copy(at);
      node.scale.setScalar(0.001);
      node.labelOpacity = 0;
      this.stage.add(node);
      await tween(this.stage, 0.4, (t) => {
        node.scale.setScalar(Math.max(0.001, easeOutBack(t)));
        node.labelOpacity = t;
      });
      const up: PlacedSystem = { kind, node, permanent: isTwg(kind), tie, users: 0 };
      this.placed.set(kind, up);
      this.arriving.delete(kind);
      return up;
    })();
    this.arriving.set(kind, promise);
    return promise;
  }

  private jiraSystem(): PlacedSystem {
    return { kind: 'jira', node: this.hub.node, permanent: true, tie: '', users: 0 };
  }
}

function easeOutBack(t: number): number {
  const c = 1.6;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}
