import { type Curve, LineCurve3, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { BEND_RADIUS, FACE_CAMERA, GRID, NODE_FOOTPRINT } from '../core/grid';
import { NEUTRAL, type Status } from '../core/palette';
import { BIG_BLOCK } from '../primitives/assembler/Assembler';
import { Branch } from '../primitives/branch/Branch';
import { distanceToPolyline, reversed, roundedPath, trimPolyline } from '../primitives/branch/gridPath';
import { Flag } from '../primitives/flag/Flag';
import { SystemNode } from '../primitives/node/SystemNode';
import { Portal } from '../primitives/portal/Portal';
import { TERMINAL_SIZE, Terminal } from '../primitives/terminal/Terminal';
import type { SceneHost } from '../stage/Stage';
import { shoot } from './beam';
import type { Incident } from './incident';
import type { CodeSide, ProductionPlace } from './storyMap';
import { tween, wait } from './timeline';

const HALF_NODE = NODE_FOOTPRINT / 2 + 0.08;
const HALF_TERMINAL = TERMINAL_SIZE / 2 + 0.06;
/** How fast a release rides out to its service. */
const RELEASE_SPEED = 3.4;
/** How close a replica or terminal may stand to another node, and to a line. */
const NODE_ROOM = 1.4;
const LINE_ROOM = 0.7;
/** A feature flag stands a little bigger than its specimen, so it reads at map scale. */
const FLAG_SCALE = 1.3;

/** A line between two services: who calls whom. */
export interface Dependency {
  from: number;
  to: number;
  line: Branch;
  /** Its points along the grid, node center to node center. */
  points: Vector3[];
}

/** A replica grown in beside a service: its line (from the service) and its node. */
export interface Replica {
  of: number;
  node: SystemNode;
  line: Branch;
}

/**
 * Production, past the portal (Rovo on Call; docs/rovo-mental-model.md).
 * Where the code side's releases go. The portal opens onto a small cluster of
 * services: a web front, the APIs behind it, the data behind those, each a
 * system node whose light is its health (green healthy, yellow degraded, red
 * down), joined by gray lines along the grid from caller to callee.
 *
 * It comes up line first, node after, tier by tier (`comeUp`). A release that
 * comes through the portal rides out along the lines to its service
 * (`deliver`). Fixes happen at a service: replicas grow in beside it (line
 * first), or its feature flag lowers.
 */
export class Production {
  readonly portal = new Portal();
  readonly nodes: SystemNode[];
  /** Portal → the front. */
  readonly exitLine: Branch;
  readonly dependencies: Dependency[] = [];
  readonly replicas: Replica[] = [];
  /** A feature flag on a service, once one is turned off there. */
  flag?: { at: number; flag: Flag };
  /** Releases delivered to a service so far. */
  delivered = 0;
  private readonly exitPoints: Vector3[];
  private readonly untick: () => void;

  constructor(
    private readonly stage: SceneHost,
    readonly place: ProductionPlace,
    code: CodeSide,
    readonly incident: Incident,
  ) {
    const { flow, tierGap } = place;
    this.portal.position.copy(code.portal);
    this.portal.rotation.y = Math.atan2(-flow.z, flow.x);
    this.portal.scale.setScalar(0.001);
    stage.add(this.portal);

    this.nodes = incident.services.map((s) => {
      const node = new SystemNode({ kind: s.kind, name: s.name });
      node.position.copy(place.tiers[s.tier][s.slot]);
      node.scale.setScalar(0.001);
      node.labelOpacity = 0;
      node.light = 'working';
      stage.add(node);
      return node;
    });
    const front = this.nodes[0].position;
    this.exitPoints = [place.exit.clone(), front.clone()];
    this.exitLine = new Branch(new LineCurve3(place.exit.clone(), front.clone().addScaledVector(flow, -HALF_NODE)), NEUTRAL.packet);
    this.exitLine.drawn = 0;
    stage.add(this.exitLine);

    // Caller → callee, along the grid: out of the caller downstream, across at the halfway line, on into the callee.
    incident.services.forEach((s, from) => {
      for (const to of s.calls) {
        const a = this.nodes[from].position.clone();
        const b = this.nodes[to].position.clone();
        const turnAt = a.clone().addScaledVector(flow, tierGap);
        const corner = b.clone().addScaledVector(flow, -tierGap);
        const points = corner.distanceTo(turnAt) < 1e-6 ? [a, b] : [a, turnAt, corner, b];
        const line = new Branch(roundedPath(trimPolyline(points.map((p) => p.clone()), HALF_NODE, HALF_NODE), BEND_RADIUS), NEUTRAL.packet);
        line.drawn = 0;
        stage.add(line);
        this.dependencies.push({ from, to, line, points });
      }
    });
    this.untick = stage.onTick((dt) => this.portal.update(dt));
  }

  /** Production comes up: the portal opens, the line draws out of it to the front, then tier by tier, each line and then the service at its end. */
  async comeUp(): Promise<void> {
    const { stage, portal } = this;
    await tween(stage, 0.45, (t) => portal.scale.setScalar(Math.max(0.001, easeOutBack(t))));
    await tween(stage, 0.8, (t) => (portal.open = t));
    await tween(stage, 0.5, (t) => (this.exitLine.drawn = t));
    await this.grow(this.nodes[0]);
    for (const tier of [1, 2]) {
      const into = this.dependencies.filter((d) => this.incident.services[d.to].tier === tier);
      await tween(stage, 0.6, (t) => into.forEach((d) => (d.line.drawn = Math.max(d.line.drawn, t))));
      await Promise.all([...new Set(into.map((d) => d.to))].map((i) => this.grow(this.nodes[i])));
    }
  }

  /** A service's health: its light (green healthy, yellow degraded, red down, off out of service). */
  health(i: number, status: Status | 'off'): void {
    this.nodes[i].light = status;
  }

  /** How a request gets from the front to service `i`: the services along the way, front first. */
  pathTo(i: number): number[] {
    const back = new Map<number, number>();
    const queue = [0];
    while (queue.length) {
      const at = queue.shift()!;
      if (at === i) break;
      for (const next of this.incident.services[at].calls) {
        if (back.has(next) || next === 0) continue;
        back.set(next, at);
        queue.push(next);
      }
    }
    const path = [i];
    while (path[0] !== 0) path.unshift(back.get(path[0])!);
    return path;
  }

  /**
   * A release came through the portal: it rides out along the line to the
   * front, and on along the lines to service `i`, and goes in. The service flashes.
   */
  async deliver(i: number): Promise<void> {
    const block = new Mesh(new RoundedBoxGeometry(BIG_BLOCK, BIG_BLOCK, BIG_BLOCK, 3, 0.05), new MeshStandardMaterial({ color: NEUTRAL.packet, roughness: 0.4, flatShading: true }));
    block.castShadow = true;
    this.stage.add(block);
    const path = this.pathTo(i);
    const legs: Curve<Vector3>[] = [this.exitLine.curve];
    path.slice(1).forEach((to, k) => legs.push(this.dependency(path[k], to).line.curve));
    const at = new Vector3();
    for (const [n, leg] of legs.entries()) {
      // It passes through each service on the way, onto the next line.
      if (n > 0) {
        const from = block.position.clone();
        leg.getPointAt(0, at);
        await tween(this.stage, 0.18, (t) => block.position.lerpVectors(from, at.clone().setY(BIG_BLOCK / 2 + 0.05), t));
      }
      await tween(this.stage, leg.getLength() / RELEASE_SPEED, (t) => {
        leg.getPointAt(t, at);
        block.position.set(at.x, BIG_BLOCK / 2 + 0.05, at.z);
        block.rotation.y = FACE_CAMERA;
      });
    }
    const from = block.position.clone();
    const into = this.nodes[i].position.clone().setY(0.3);
    await tween(this.stage, 0.3, (t) => {
      block.position.lerpVectors(from, into, t);
      block.scale.setScalar(Math.max(0.001, 1 - t));
    });
    block.removeFromParent();
    block.geometry.dispose();
    (block.material as MeshStandardMaterial).dispose();
    this.delivered++;
  }

  /** Tracing the dependencies of service `i`: a status packet rides each line into it and each line out of it. */
  async trace(i: number): Promise<void> {
    const touching = this.dependencies.filter((d) => d.from === i || d.to === i);
    await Promise.all(
      touching.map(async (d, k) => {
        await wait(this.stage, k * 0.2);
        await shoot(this.stage, d.to === i ? d.line.curve : reversed(d.line.curve), 5);
      }),
    );
  }

  /**
   * Spots beside service `i` with room for something to stand (a replica, a
   * terminal): along the grid from it, inside production's block (halfway to
   * the next slot across, or an empty slot of its tier), clear of every node and line.
   */
  spotsBeside(i: number, taken: readonly Vector3[] = []): Vector3[] {
    const { across, slotGap, tiers } = this.place;
    // Halfway to the next slot, on the grid.
    const half = Math.floor(slotGap / 2 / GRID) * GRID;
    const service = this.incident.services[i];
    const at = this.nodes[i].position;
    const others = [...this.nodes.map((n) => n.position), ...this.replicas.map((r) => r.node.position), ...taken];
    const lines = [this.exitPoints, ...this.dependencies.map((d) => d.points)];
    const slots = tiers[service.tier];
    const inBlock = (p: Vector3) => {
      const v = (q: Vector3) => q.dot(across);
      const all = tiers.flat().map(v);
      return v(p) >= Math.min(...all) - slotGap / 2 - 1e-6 && v(p) <= Math.max(...all) + slotGap / 2 + 1e-6;
    };
    const candidates = [
      at.clone().addScaledVector(across, half),
      at.clone().addScaledVector(across, -half),
      ...slots.filter((s) => s.distanceTo(at) > 1e-6),
    ].filter(inBlock);
    const free: Vector3[] = [];
    for (const spot of candidates) {
      const crowd = [...others, ...free];
      if (crowd.some((o) => o !== at && o.distanceTo(spot) < NODE_ROOM)) continue;
      // Its own line from the service runs straight out to it; nothing else may sit on that run.
      if (lines.some((l) => distanceToPolyline(spot.x, spot.z, l) < LINE_ROOM)) continue;
      if (crowd.some((o) => o !== at && o.distanceTo(spot) > 1e-6 && distanceToPolyline(o.x, o.z, [at, spot]) < NODE_ROOM - 0.2)) continue;
      free.push(spot);
    }
    return free;
  }

  /** A replica of service `i` grows in at `spot`: the line draws out of the service first, then the replica stands up at its end, healthy. */
  async addReplica(i: number, spot: Vector3, name: string): Promise<Replica> {
    const service = this.nodes[i];
    const toward = spot.clone().sub(service.position).normalize();
    const line = new Branch(
      new LineCurve3(service.position.clone().addScaledVector(toward, HALF_NODE), spot.clone().addScaledVector(toward, -HALF_NODE)),
      NEUTRAL.packet,
    );
    line.drawn = 0;
    this.stage.add(line);
    await tween(this.stage, 0.45, (t) => (line.drawn = t));
    // No name under it: it's one more of the service (its card names it).
    const node = new SystemNode({ kind: service.kind, name, showLabel: false });
    node.position.copy(spot);
    node.scale.setScalar(0.001);
    node.labelOpacity = 0;
    node.light = 'working';
    this.stage.add(node);
    const replica = { of: i, node, line };
    this.replicas.push(replica);
    await this.grow(node);
    return replica;
  }

  /** A replica that was only for the spike goes: it folds first, then its line draws back into the service. */
  async removeReplica(replica: Replica): Promise<void> {
    const { node, line } = replica;
    await tween(this.stage, 0.35, (t) => {
      node.scale.setScalar(Math.max(0.001, 1 - t));
      node.labelOpacity = 1 - t;
    });
    await tween(this.stage, 0.4, (t) => (line.drawn = Math.max(0.001, 1 - t)));
    this.replicas.splice(this.replicas.indexOf(replica), 1);
    node.dispose();
    line.dispose();
  }

  /** The feature flag at service `i` is turned off: the flag stands up on the service's slab, raised, then lowers. */
  async flagOff(i: number): Promise<void> {
    const flag = new Flag();
    const node = this.nodes[i];
    // On the slab's right-hand corner, clear of the emblem and of a copy hovering over it.
    flag.position.copy(node.position).add(new Vector3(0.34, 0.2, -0.34));
    flag.rotation.y = FACE_CAMERA;
    flag.scale.setScalar(0.001);
    this.stage.add(flag);
    this.flag = { at: i, flag };
    await tween(this.stage, 0.35, (t) => flag.scale.setScalar(Math.max(0.001, FLAG_SCALE * easeOutBack(t))));
    await tween(this.stage, 0.7, (t) => (flag.raised = 1 - t * t));
  }

  /**
   * A terminal tailing service `i`'s logs, built out from a copy at `spot`:
   * the terminal grows in under it, then its line draws into the service.
   * Returns the terminal and how to fold it back (line first, then the terminal).
   */
  async logsTerminal(i: number, spot: Vector3, seed: number): Promise<{ terminal: Terminal; fold: () => Promise<void> }> {
    const { stage } = this;
    const service = this.nodes[i].position;
    const toward = service.clone().sub(spot).normalize();
    const terminal = new Terminal({ state: 'admin', seed });
    terminal.position.copy(spot);
    terminal.scale.setScalar(0.001);
    const line = new Branch(new LineCurve3(spot.clone().addScaledVector(toward, HALF_TERMINAL), service.clone().addScaledVector(toward, -HALF_NODE)), NEUTRAL.packet);
    line.drawn = 0;
    stage.add(terminal, line);
    const untick = stage.onTick((dt) => terminal.update(dt));
    await tween(stage, 0.4, (t) => terminal.scale.setScalar(Math.max(0.001, easeOutBack(t))));
    await tween(stage, 0.45, (t) => (line.drawn = t));
    terminal.state = 'tail';
    return {
      terminal,
      fold: async () => {
        await tween(stage, 0.4, (t) => (line.drawn = Math.max(0.001, 1 - t)));
        terminal.state = 'off';
        await tween(stage, 0.35, (t) => terminal.scale.setScalar(Math.max(0.001, 1 - t)));
        untick();
        terminal.dispose();
        line.dispose();
      },
    };
  }

  /** Every node standing in production, for keeping lines and spots clear. */
  positions(): Vector3[] {
    return [this.portal.position, ...this.nodes.map((n) => n.position), ...this.replicas.map((r) => r.node.position)];
  }

  dispose(): void {
    this.untick();
    for (const n of this.nodes) n.dispose();
    for (const d of this.dependencies) d.line.dispose();
    for (const r of this.replicas) {
      r.node.dispose();
      r.line.dispose();
    }
    this.flag?.flag.dispose();
    this.exitLine.dispose();
    this.portal.dispose();
  }

  private dependency(from: number, to: number): Dependency {
    const d = this.dependencies.find((x) => x.from === from && x.to === to);
    if (!d) throw new Error(`Production: no line from ${from} to ${to}`);
    return d;
  }

  private async grow(node: SystemNode): Promise<void> {
    await tween(this.stage, 0.4, (t) => {
      node.scale.setScalar(Math.max(0.001, easeOutBack(t)));
      node.labelOpacity = t;
    });
  }
}

function easeOutBack(t: number): number {
  const c = 1.6;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}
