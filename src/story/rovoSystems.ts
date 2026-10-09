import { Group, MeshStandardMaterial, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { NODE_FOOTPRINT } from '../core/grid';
import { solid } from '../core/mesh';
import { NEUTRAL } from '../core/palette';
import { GRAPH_COLOR } from '../primitives/graph/GraphEdge';
import { Product } from '../primitives/product/Product';
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
  /** A third-party tool joins the Teamwork Graph through a connector: the plug where its line meets it. */
  readonly connector?: Group;
  /** What's been written back to it, newest last (a few stay on view). */
  readonly writeBacks: Product[];
  users: number;
}

/** Write-backs shown at a system at most; past that the oldest go. */
export const WRITE_BACKS_SHOWN = 3;

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
    const { node, connector } = up;
    await tween(this.stage, 0.4, (t) => {
      node.scale.setScalar(Math.max(0.001, 1 - t));
      node.labelOpacity = 1 - t;
      connector?.scale.setScalar(Math.max(0.001, 1 - t));
    });
    for (const p of up.writeBacks) p.dispose();
    connector?.removeFromParent();
    node.dispose();
    await this.hub.untie(up.tie);
  }

  /** A step wrote to the system: its result stays there, a small product on the node's slab (the oldest go past a few). */
  writeBack(kind: SystemKind): void {
    const up = this.placed.get(kind);
    if (!up) return;
    const product = new Product(kind);
    product.scale.setScalar(0.001);
    up.node.add(product);
    up.writeBacks.push(product);
    if (up.writeBacks.length > WRITE_BACKS_SHOWN) up.writeBacks.shift()?.dispose();
    // Stacked at the slab's left-hand corner, clear of the emblem and of a copy hovering over it.
    up.writeBacks.forEach((p, i) => p.position.set(-0.32, 0.3 + i * 0.2, 0.32));
    void tween(this.stage, 0.3, (t) => product.scale.setScalar(Math.max(0.001, 0.75 * t)));
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
      // A third-party tool plugs in through a connector at the end of its line.
      const permanent = isTwg(kind);
      const connector = permanent ? undefined : this.plug(tie);
      const node = new SystemNode({ kind });
      node.position.copy(at);
      node.scale.setScalar(0.001);
      node.labelOpacity = 0;
      this.stage.add(node);
      await tween(this.stage, 0.4, (t) => {
        node.scale.setScalar(Math.max(0.001, easeOutBack(t)));
        node.labelOpacity = t;
        connector?.scale.setScalar(Math.max(0.001, easeOutBack(t)));
      });
      const up: PlacedSystem = { kind, node, permanent, tie, connector, writeBacks: [], users: 0 };
      this.placed.set(kind, up);
      this.arriving.delete(kind);
      return up;
    })();
    this.arriving.set(kind, promise);
    return promise;
  }

  private jiraSystem(): PlacedSystem {
    return { kind: 'jira', node: this.hub.node, permanent: true, tie: '', writeBacks: [], users: 0 };
  }

  /** The connector: a small white plug with a Teamwork Graph blue band, at the end of the tool's line. */
  private plug(tie: string): Group | undefined {
    const edge = this.hub.ties.get(tie);
    if (!edge) return undefined;
    const plug = new Group();
    plug.add(solid(new RoundedBoxGeometry(0.2, 0.12, 0.2, 2, 0.04), new MeshStandardMaterial({ color: NEUTRAL.shell, roughness: 0.45 }))).position.y = 0.06;
    const band = new MeshStandardMaterial({ color: GRAPH_COLOR, emissive: GRAPH_COLOR, emissiveIntensity: 0.5 });
    plug.add(solid(new RoundedBoxGeometry(0.22, 0.03, 0.22, 2, 0.012), band)).position.y = 0.1;
    plug.position.copy(edge.path.getPoint(1)).setY(0);
    plug.scale.setScalar(0.001);
    this.stage.add(plug);
    return plug;
  }
}

function easeOutBack(t: number): number {
  const c = 1.6;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}
