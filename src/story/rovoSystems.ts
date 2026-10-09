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
import { graphPlate, type JiraHub } from './jiraHub';
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
  /** The Teamwork Graph's core apps stand on a plate of their own, a size up (see `establish`). */
  readonly plate?: Group;
  users: number;
}

/** Write-backs shown at a system at most; past that the oldest go. */
export const WRITE_BACKS_SHOWN = 3;
/** The Teamwork Graph's core apps (beside Jira): their plate's width, and how much bigger they stand than other systems. */
export const TWG_PLATE = 2.2;
export const TWG_SCALE = 1.2;

/**
 * The systems on Rovo's grid. Jira is there from the start (the hub). Any
 * other system comes up the first time a copy of Rovo calls it, reacting to
 * the copy: it grows in right under the copy, then reaches out to Jira (a
 * third-party tool through a connector), its Graph Line drawing in to Jira.
 * Teamwork Graph apps then stay; a third-party tool goes again (its line
 * draws back into it, then it folds away) once no open task still needs it.
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
    /** Laid-out routes from Jira to systems (shortest, each its own): ties run along these where given. */
    private readonly routes: Partial<Record<SystemKind, readonly Vector3[]>> = {},
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
    // The reverse of coming up: its line draws back into it from Jira, then it folds away.
    await this.hub.untie(up.tie);
    await tween(this.stage, 0.4, (t) => {
      node.scale.setScalar(Math.max(0.001, 1 - t));
      node.labelOpacity = 1 - t;
      connector?.scale.setScalar(Math.max(0.001, 1 - t));
    });
    for (const p of up.writeBacks) p.dispose();
    connector?.removeFromParent();
    node.dispose();
  }

  /**
   * A core Teamwork Graph app comes up with Jira, prominent and for good: its
   * Graph Line draws out from Jira, then it stands up at the line's end on a
   * plate of its own, a size up. Calls to it from then on find it there.
   */
  async establish(kind: SystemKind): Promise<PlacedSystem> {
    const at = this.places[kind];
    if (!at) throw new Error(`SystemsOnGrid: no place for ${kind}`);
    const tie = `system:${kind}:${++this.ups}`;
    await this.hub.tie(tie, at, this.arrive[kind], TWG_PLATE / 2 + 0.05, false, this.routes[kind]);
    const plate = graphPlate(TWG_PLATE);
    plate.position.copy(at);
    plate.scale.setScalar(0.001);
    const node = new SystemNode({ kind });
    node.position.copy(at);
    node.scale.setScalar(0.001);
    node.labelOpacity = 0;
    this.stage.add(plate, node);
    await tween(this.stage, 0.5, (t) => {
      const k = Math.max(0.001, easeOutBack(t));
      plate.scale.setScalar(k);
      node.scale.setScalar(TWG_SCALE * k);
      node.labelOpacity = t;
    });
    const up: PlacedSystem = { kind, node, permanent: true, tie, plate, writeBacks: [], users: 0 };
    this.placed.set(kind, up);
    return up;
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
      // It comes up for the copy that called it, right under it; then it reaches out to Jira.
      const node = new SystemNode({ kind });
      node.position.copy(at);
      node.scale.setScalar(0.001);
      node.labelOpacity = 0;
      this.stage.add(node);
      await tween(this.stage, 0.4, (t) => {
        node.scale.setScalar(Math.max(0.001, easeOutBack(t)));
        node.labelOpacity = t;
      });
      const tie = `system:${kind}:${++this.ups}`;
      const permanent = isTwg(kind);
      // A third-party tool plugs into the Teamwork Graph through a connector first.
      const connector = permanent ? undefined : this.plug(at);
      if (connector) await tween(this.stage, 0.25, (t) => connector.scale.setScalar(Math.max(0.001, easeOutBack(t))));
      await this.hub.tie(tie, at, this.arrive[kind], NODE_FOOTPRINT / 2 + 0.1, true, this.routes[kind]);
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

  /** The connector: a small white plug with a Teamwork Graph blue band, on the node's slab where its line leaves for Jira. */
  private plug(at: Vector3): Group {
    const plug = new Group();
    plug.add(solid(new RoundedBoxGeometry(0.2, 0.12, 0.2, 2, 0.04), new MeshStandardMaterial({ color: NEUTRAL.shell, roughness: 0.45 }))).position.y = 0.06;
    const band = new MeshStandardMaterial({ color: GRAPH_COLOR, emissive: GRAPH_COLOR, emissiveIntensity: 0.5 });
    plug.add(solid(new RoundedBoxGeometry(0.22, 0.03, 0.22, 2, 0.012), band)).position.y = 0.1;
    // On the slab's corner toward Jira, where the line sets off.
    const toward = this.hub.node.position.clone().sub(at);
    plug.position.set(at.x + Math.sign(toward.x) * 0.3, 0.2, at.z + Math.sign(toward.z) * 0.3);
    plug.scale.setScalar(0.001);
    this.stage.add(plug);
    return plug;
  }
}

function easeOutBack(t: number): number {
  const c = 1.6;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}
