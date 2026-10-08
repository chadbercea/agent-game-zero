import { type Curve, MathUtils, type Object3D, type Vector3 } from 'three';
import { GridPatch } from './GridPatch';

/**
 * The one rule for the grid under lines (ILI-968), shared by every line that
 * draws on the floor: while a line draws, the faint grid comes up under it;
 * once the line has settled, the grid lingers a moment, then fades away.
 * Tune it here and every line follows.
 */
export const GRID_FADE = {
  /** Seconds for the grid to come up under a drawing line. */
  in: 0.3,
  /** Seconds the grid stays after the line stops drawing (or is let go). */
  linger: 1.4,
  /** Seconds for the grid to fade away. */
  out: 0.9,
};

/** How many points a curve is sampled at to lay its grid patch. */
const SAMPLES_PER_UNIT = 4;
/** Longest frame step the fade will take (a paused tab shouldn't jump it). */
const MAX_STEP = 0.1;

/**
 * The faint grid under one line, run by GRID_FADE. Lines own one and call
 * `pulse()` whenever they draw; anyone keeping a line up on purpose (a map
 * hovered, a sub-agent working along it) can `hold(true)` it. Each line has
 * its own patch, so overlapping lines never fight over the grid.
 *
 * It keeps its own time while it's showing (on render, so owners needn't
 * tick it); `update(dt)` steps it by hand, for tests.
 */
export class GridFade {
  readonly patch: GridPatch;
  private level = 0;
  /** Seconds since the line last drew. */
  private since = Infinity;
  private held = false;
  private last = -1;

  constructor(path: Curve<Vector3> | Vector3[]) {
    const points = Array.isArray(path)
      ? path
      : path.getSpacedPoints(Math.max(2, Math.ceil(path.getLength() * SAMPLES_PER_UNIT)));
    this.patch = new GridPatch(points);
    this.patch.opacity = 0;
    this.patch.onBeforeRender = () => {
      const now = performance.now() / 1000;
      if (this.last >= 0) this.update(Math.min(MAX_STEP, now - this.last));
      this.last = now;
    };
  }

  /** How much grid is showing (0–1). */
  get opacity(): number {
    return this.level;
  }

  /** The line just drew: bring the grid up and restart the linger. */
  pulse(): void {
    this.since = 0;
    this.wake();
  }

  /** Keep the grid up while true; let go and it lingers, then fades. */
  hold(on: boolean): void {
    if (on === this.held) return;
    this.held = on;
    if (on) this.wake();
    else this.since = 0;
  }

  update(dt: number): void {
    this.since += dt;
    const up = this.held || this.since < GRID_FADE.linger;
    this.level = up ? Math.min(1, this.level + dt / GRID_FADE.in) : Math.max(0, this.level - dt / GRID_FADE.out);
    this.patch.opacity = MathUtils.clamp(this.level, 0, 1);
    // Showing: keep ticking on render. Gone: sleep until the next pulse.
    if (this.level <= 0) {
      this.patch.visible = false;
      this.last = -1;
    }
  }

  /** Lay the grid down beside `line`, in the same parent, so it shows and hides on its own. */
  follow(line: Object3D): void {
    line.addEventListener('added', () => line.parent?.add(this.patch));
    line.addEventListener('removed', () => this.patch.removeFromParent());
  }

  dispose(): void {
    this.patch.dispose();
  }

  /** Make the patch render (so it ticks) even at zero, until it fades out again. */
  private wake(): void {
    this.patch.visible = true;
  }
}
