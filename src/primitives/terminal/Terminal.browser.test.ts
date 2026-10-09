import { describe, expect, it } from 'vitest';
import { TERMINAL_HEIGHT, TERMINAL_SIZE, Terminal } from './Terminal';

describe('Terminal', () => {
  it('lies flat on the grid: a node footprint, thin, never rotated', () => {
    const terminal = new Terminal();
    expect(TERMINAL_SIZE).toBe(1);
    expect(TERMINAL_HEIGHT).toBeLessThan(0.1);
    expect(terminal.rotation.y).toBe(0);
  });

  it('switches states; the diff writes rows in over time; pass marks it until the state changes', () => {
    const terminal = new Terminal({ state: 'admin' });
    expect(terminal.state).toBe('admin');
    terminal.state = 'diff';
    expect(terminal.written).toBe(0);
    for (let i = 0; i < 60; i++) terminal.update(1 / 30);
    expect(terminal.written).toBeGreaterThan(2);
    terminal.state = 'tail';
    for (let i = 0; i < 60; i++) terminal.update(1 / 30);
    terminal.pass();
    expect(terminal.passed).toBe(true);
    terminal.state = 'off';
    expect(terminal.passed).toBe(false);
    terminal.dispose();
  });

  it('the same seed draws the same screen', () => {
    const draw = (seed: number) => {
      const t = new Terminal({ state: 'diff', seed });
      for (let i = 0; i < 90; i++) t.update(1 / 30);
      const data = (t.screenMaterial.map?.image as HTMLCanvasElement).toDataURL();
      t.dispose();
      return data;
    };
    expect(draw(4)).toBe(draw(4));
    expect(draw(4)).not.toBe(draw(5));
  });
});
