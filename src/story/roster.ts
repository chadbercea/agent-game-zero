import type { Drone, DroneOptions } from '../primitives/drone/Drone';
import { type SpawnedDrone, spawnDrone } from '../stage/spawnDrone';
import type { SceneHost } from '../stage/Stage';
import { tween, wait } from './timeline';

/** How long a drone takes to fade out when it leaves. */
export const DESPAWN_SECONDS = 0.35;
/** Gap between drones leaving when the roster clears the stage. */
const CLEAR_STAGGER = 0.08;

/** One entry in the sequence: who came or went, and when (stage seconds since the run began). */
export interface RosterEvent {
  event: 'spawn' | 'despawn';
  name: string;
  at: number;
}

/** Spawns a drone, like spawnDrone. */
export type Spawner = (stage: SceneHost, x: number, z: number, options?: DroneOptions) => SpawnedDrone;

/**
 * The roster: every drone in the story comes and goes through it, so the
 * order they appear and leave in is one defined sequence (`log`), the same
 * every run for the same seed. A drone leaving fades out rather than
 * popping; despawning one twice is harmless. `clear()` sends everyone still
 * on stage away in reverse order of arrival. Agents that stay on the grid
 * between runs (D3V1N) are noted with `arrive` and `leave`.
 */
export class Roster {
  readonly log: RosterEvent[] = [];
  private readonly live: { name: string; sub: SpawnedDrone }[] = [];
  private clock = 0;
  /** While frozen, despawns are held: `clear()` sends everyone away in order instead. */
  private frozen = false;

  constructor(private readonly stage: SceneHost) {
    stage.onTick((dt) => (this.clock += dt));
  }

  /** Start a new run: the clock restarts and the log is cleared. */
  begin(): void {
    this.clock = 0;
    this.log.length = 0;
  }

  /** Who's on stage now, in order of arrival. */
  get names(): string[] {
    return this.live.map((l) => l.name);
  }

  /** Spawn a drone through the roster (same signature as spawnDrone). Its `despawn` fades it out and logs it. */
  readonly spawn: Spawner = (stage, x, z, options = {}) => {
    const sub = spawnDrone(stage, x, z, options);
    const name = options.name ?? sub.drone.name;
    const entry = { name, sub };
    this.live.push(entry);
    this.note('spawn', name);
    let gone = false;
    const remove = sub.despawn;
    return {
      ...sub,
      despawn: () => {
        if (gone || this.frozen) return;
        gone = true;
        void this.leave(entry, remove);
      },
    };
  };

  /** An agent that stays on the grid between runs comes on stage. */
  arrive(drone: Drone): void {
    this.note('spawn', drone.name);
  }

  /** That agent leaves the stage. */
  depart(drone: Drone): void {
    this.note('despawn', drone.name);
  }

  /** Hold despawns until `clear()` (so stopping everything at once doesn't scatter the order). */
  freeze(): void {
    this.frozen = true;
  }

  /** Everyone still on stage leaves, newest first, one after another. */
  async clear(): Promise<void> {
    const out = [...this.live].reverse();
    await Promise.all(
      out.map(async (entry, i) => {
        await wait(this.stage, i * CLEAR_STAGGER);
        await this.leave(entry, entry.sub.despawn);
      }),
    );
    this.frozen = false;
  }

  private async leave(entry: { name: string; sub: SpawnedDrone }, remove: () => void): Promise<void> {
    const i = this.live.indexOf(entry);
    if (i < 0) return;
    this.live.splice(i, 1);
    this.note('despawn', entry.name);
    const { drone } = entry.sub;
    const from = drone.fade;
    if (from > 0) await tween(this.stage, DESPAWN_SECONDS, (t) => (drone.fade = from * (1 - t)));
    remove();
  }

  private note(event: RosterEvent['event'], name: string): void {
    this.log.push({ event, name, at: Math.round(this.clock * 100) / 100 });
  }
}
