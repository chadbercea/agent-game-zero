import { Vector3 } from 'three';
import { DroneFlight } from '../animation/DroneFlight';
import { GateAnimator } from '../animation/GateAnimator';
import { seededRandom } from '../core/scatter';
import { HOVER_HEIGHT, SUB_AGENT_SCALE } from '../primitives/drone/Drone';
import { Gate } from '../primitives/gate/Gate';
import { ATLASSIAN_KINDS, type AtlassianKind } from '../primitives/node/emblems';
import { attachSignal } from '../stage/attachSignal';
import { type SpawnedDrone, spawnDrone } from '../stage/spawnDrone';
import type { SceneHost } from '../stage/Stage';
import { accessCheck } from './accessCheck';
import { shoot } from './beam';
import { reversed } from '../primitives/branch/gridPath';
import { revealNode } from './revealMap';
import { SystemMap } from './SystemMap';
import { Tertiaries } from './tertiary';
import { fly, tween, wait } from './timeline';

/** Rovo's gate sits at the origin: Rovo, the first thing on the grid, is dead center. */
/** Tools that are always on the grid, from the first frame. */
export const PERSISTENT: readonly AtlassianKind[] = ['jira'];
export const ROVO_GATE = new Vector3(0, 0, 0);
/** How long a sub-agent works a tool before its product heads back, picked from this range. */
const WORK: [number, number] = [2.5, 5];
/** Seconds between Rovo sending out sub-agents, picked from this range. */
const SEND_GAP: [number, number] = [0.8, 2.2];
const SUB_SPEED = 4;
const RIDE_SPEED = 5;
/** Seconds a sub-agent takes to fade into being inside Rovo before it flies out. */
const EMERGE_SECONDS = 0.25;
/** How high a sub-agent's floor anchor sits for its body to be level with Rovo's body. */
const AT_ROVOS_BODY = HOVER_HEIGHT * (1 - SUB_AGENT_SCALE);

/**
 * Rovo working its Atlassian grid (Story Narrative). Rovo floats in at the
 * center, on its gate, and gets access (yellow, then green). From then on it
 * keeps its system busy: it calls up a tool (its line draws out from the
 * gate over the grid and the tool rises; Jira, Confluence, Bitbucket, Code
 * search, laid out by the grid guide), sends a sub-agent out of its own body
 * (it pops out of Rovo, then flies straight to the tool),
 * which builds a tertiary of its own off the tool and works there; the work
 * feeds into the tool, and the tool's product rides its line back to Rovo.
 * Then the sub-agent comes home and dissolves into Rovo. One to three out at
 * a time, on a seeded RNG, so a seed plays the same run.
 */
export class RovoAtlassian {
  readonly rovo: SpawnedDrone;
  readonly gate = new Gate();
  readonly map: SystemMap;
  readonly tertiaries: Tertiaries;
  /** How many sub-agents Rovo runs at once this run (1–3). */
  readonly crew: number;
  /** Tools called up so far, in order. */
  readonly called: AtlassianKind[] = [];
  /** Products that have come home to Rovo, by tool. */
  readonly delivered: AtlassianKind[] = [];
  out = 0;
  peakOut = 0;
  /** Sub-agents working each tool right now. */
  private readonly working = new Map<AtlassianKind, number>();
  private readonly random: () => number;
  private running = false;
  private subs = 0;

  constructor(
    private readonly stage: SceneHost,
    seed = 3,
  ) {
    this.random = seededRandom(seed);
    this.crew = 1 + Math.floor(this.random() * 3);
    this.gate.position.copy(ROVO_GATE);
    const animator = new GateAnimator(this.gate);
    stage.onTick((dt) => animator.update(dt));
    stage.add(this.gate);
    this.map = mapFor(stage, this.gate, seed);
    this.map.hide();
    // Jira is always on the grid: it's where the work is tracked, so it's there from the first frame
    // and is never called up or put away. The other tools still come up when Rovo first needs them.
    for (const kind of PERSISTENT) {
      const i = ATLASSIAN_KINDS.indexOf(kind);
      this.map.setRise(i, 1);
      this.map.branches[i].drawn = 1;
    }
    this.tertiaries = new Tertiaries(stage, () => [this.gate.position, ...this.map.nodes.map((n) => n.position)]);
    this.rovo = spawnDrone(stage, ROVO_GATE.x, ROVO_GATE.z, { name: 'Rovo', lineage: 'cyan', showLabel: true, status: 'waiting' });
    this.rovo.drone.fade = 0;
    attachSignal(stage, this.rovo.drone, this.gate);
  }

  /** Rovo floats in and gets access; then the work loop runs until `stop()`. */
  async start(): Promise<void> {
    const { stage } = this;
    const rovo = this.rovo.drone;
    this.running = true;
    await tween(stage, 0.8, (t) => (rovo.fade = t));
    await wait(stage, 0.4);
    await accessCheck(stage, rovo, this.gate, { thinkSeconds: 1.2 });
    rovo.status = 'working';
    while (this.running) {
      if (this.out < this.crew) void this.send(ATLASSIAN_KINDS[Math.floor(this.random() * ATLASSIAN_KINDS.length)]);
      await wait(stage, this.between(SEND_GAP));
    }
  }

  stop(): void {
    this.running = false;
  }

  /** Call a tool up (if it isn't already) and send a sub-agent to work it. */
  private async send(kind: AtlassianKind): Promise<void> {
    const { stage, map } = this;
    const rovo = this.rovo.drone;
    const i = ATLASSIAN_KINDS.indexOf(kind);
    const node = map.nodes[i];
    this.out++;
    this.peakOut = Math.max(this.peakOut, this.out);
    if (!node.visible) {
      await revealNode(stage, map, i);
      this.called.push(kind);
    }
    map.setActive(i, true);
    // The sub-agent builds its own tertiary off the tool as it goes to use it (ILI-974).
    const place = this.tertiaries.claim(node);
    const sub = spawnDrone(stage, rovo.position.x, rovo.position.z, {
      name: `Rovo.${++this.subs}`,
      lineage: 'cyan',
      subAgent: true,
      status: 'working',
    });
    // Born inside Rovo, full size: it fades into being in Rovo's body, then flies out of it, settling to
    // its own height on the way. It never grows, and it never comes up from the floor.
    sub.drone.position.y = AT_ROVOS_BODY;
    sub.drone.fade = 0;
    rovo.flash = 1;
    await tween(stage, EMERGE_SECONDS, (t) => (sub.drone.fade = t));
    await fly(stage, DroneFlight.to(sub.drone, place.spot, { speed: SUB_SPEED, fromHeight: AT_ROVOS_BODY, lift: 0 }));
    this.working.set(kind, (this.working.get(kind) ?? 0) + 1);
    node.light = 'working';
    await wait(stage, this.between(WORK));
    // The tool's product rides its line home to Rovo.
    await shoot(stage, reversed(map.routes[i]), RIDE_SPEED, undefined, kind);
    this.delivered.push(kind);
    rovo.flash = 1;
    await this.home(sub);
    place.release();
    map.setActive(i, false);
    const left = (this.working.get(kind) ?? 1) - 1;
    this.working.set(kind, left);
    // Lit while anyone's working it; dark once its last sub-agent is home.
    if (!left) node.light = 'off';
    this.out--;
  }

  /** A sub-agent flies straight back to Rovo, rising into its body, and fades away inside it (no shrinking). */
  private async home(sub: SpawnedDrone): Promise<void> {
    const { stage } = this;
    await fly(stage, DroneFlight.to(sub.drone, this.rovo.drone.position, { speed: SUB_SPEED, toHeight: AT_ROVOS_BODY, lift: 0 }));
    await tween(stage, 0.3, (t) => (sub.drone.fade = 1 - t));
    sub.despawn();
  }

  private between([lo, hi]: [number, number]): number {
    return lo + this.random() * (hi - lo);
  }
}

/** The system's map for a seed; a seed that boxes a tool in with no room falls through to the next one. */
function mapFor(stage: SceneHost, gate: Gate, seed: number): SystemMap {
  for (let attempt = 0; ; attempt++) {
    try {
      return new SystemMap(stage, gate, ATLASSIAN_KINDS, { seed: seed + attempt });
    } catch (e) {
      if (attempt >= 8) throw e;
    }
  }
}
