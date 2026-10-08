import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { GRID_FADE, GridFade } from './GridFade';

const line = [new Vector3(0, 0, 0), new Vector3(2, 0, 0)];

/** Step a fade `seconds` forward in small frames. */
function run(grid: GridFade, seconds: number) {
  for (let t = 0; t < seconds; t += 1 / 60) grid.update(1 / 60);
}

describe('GridFade: the grid under lines', () => {
  it('stays hidden until its line draws', () => {
    const grid = new GridFade(line);
    run(grid, 1);
    expect(grid.opacity).toBe(0);
    expect(grid.patch.visible).toBe(false);
  });

  it('comes up while the line draws, lingers once it settles, then fades away', () => {
    const grid = new GridFade(line);
    grid.pulse();
    run(grid, GRID_FADE.in + 0.05);
    expect(grid.opacity).toBe(1);
    // Still drawing: it stays up.
    for (let i = 0; i < 30; i++) {
      grid.pulse();
      grid.update(1 / 30);
    }
    expect(grid.opacity).toBe(1);
    // Settled: up for the linger, then gone after the fade.
    run(grid, GRID_FADE.linger - 0.1);
    expect(grid.opacity).toBe(1);
    run(grid, 0.1 + GRID_FADE.out + 0.05);
    expect(grid.opacity).toBe(0);
    expect(grid.patch.visible).toBe(false);
  });

  it('a line held up keeps its grid until it is let go', () => {
    const grid = new GridFade(line);
    grid.pulse();
    grid.hold(true);
    run(grid, GRID_FADE.linger + GRID_FADE.out + 2);
    expect(grid.opacity).toBe(1);
    grid.hold(false);
    run(grid, GRID_FADE.linger + GRID_FADE.out + 0.1);
    expect(grid.opacity).toBe(0);
  });

  it('two overlapping lines each keep their own grid: one fading never takes the other', () => {
    const a = new GridFade(line);
    const b = new GridFade(line);
    a.pulse();
    b.pulse();
    b.hold(true);
    run(a, GRID_FADE.linger + GRID_FADE.out + 0.1);
    run(b, GRID_FADE.linger + GRID_FADE.out + 0.1);
    expect(a.opacity).toBe(0);
    expect(b.opacity).toBe(1);
  });
});

describe('every line follows the one rule', () => {
  it('a Branch and a GraphEdge bring their grid up as they draw, laid beside them in the same parent', async () => {
    const { Branch } = await import('./Branch');
    const { GraphEdge } = await import('../graph/GraphEdge');
    const { Color, Group } = await import('three');
    const { roundedPath } = await import('./gridPath');
    const parent = new Group();
    const branch = new Branch(roundedPath(line, 0.35), new Color('#888'));
    const edge = new GraphEdge(roundedPath(line, 0.35));
    parent.add(branch, edge);
    expect(parent.children).toContain(branch.grid.patch);
    expect(parent.children).toContain(edge.grid.patch);
    for (const l of [branch, edge]) {
      l.drawn = 0.5;
      l.grid.update(GRID_FADE.in + 0.05);
      expect(l.grid.opacity).toBe(1);
    }
    branch.removeFromParent();
    expect(parent.children).not.toContain(branch.grid.patch);
  });
});
