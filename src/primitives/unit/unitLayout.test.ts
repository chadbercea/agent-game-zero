import { describe, expect, it } from 'vitest';
import { GRID, NODE_FOOTPRINT } from '../../core/grid';
import { attachPoint, distanceToRect, PANEL_LENGTH, unitLayout } from './unitLayout';

const width = (r: { minX: number; maxX: number }) => r.maxX - r.minX;

describe('unitLayout', () => {
  it('keeps the node in the upper-left corner whichever way the panel goes', () => {
    const x = unitLayout('x');
    const z = unitLayout('z');
    expect(x.node).toEqual(z.node);
    for (const { node, border } of [x, z]) {
      expect(node.minX - border.minX).toBeCloseTo(GRID / 2);
      expect(node.minZ - border.minZ).toBeCloseTo(GRID / 2);
    }
  });

  it('puts the panel right of the node along X and below it along Z', () => {
    const x = unitLayout('x');
    expect(x.panel.minX).toBeGreaterThan(x.node.maxX);
    expect(x.panel.minZ).toBeCloseTo(x.node.minZ);
    const z = unitLayout('z');
    expect(z.panel.minZ).toBeGreaterThan(z.node.maxZ);
    expect(z.panel.minX).toBeCloseTo(z.node.minX);
  });

  it('makes the node 1/3 to 1/2 of the panel, and the panel the same strip either way', () => {
    const ratio = NODE_FOOTPRINT / PANEL_LENGTH;
    expect(ratio).toBeGreaterThanOrEqual(1 / 3);
    expect(ratio).toBeLessThanOrEqual(1 / 2);
    expect(width(unitLayout('x').panel)).toBeCloseTo(PANEL_LENGTH);
    expect(width(unitLayout('z').panel)).toBeCloseTo(PANEL_LENGTH);
  });

  it('wraps node and panel in one border', () => {
    for (const d of ['x', 'z'] as const) {
      const { node, panel, border } = unitLayout(d);
      for (const r of [node, panel]) {
        expect(r.minX).toBeGreaterThan(border.minX);
        expect(r.maxX).toBeLessThan(border.maxX);
        expect(r.minZ).toBeGreaterThan(border.minZ);
        expect(r.maxZ).toBeLessThan(border.maxZ);
      }
    }
  });
});

describe('attachPoint', () => {
  const { border } = unitLayout('x');

  it('lands on the border where a grid line meets it', () => {
    expect(attachPoint(border, '+x', 0.5).toArray()).toEqual([border.maxX, 0, 0.5]);
    expect(attachPoint(border, '-z', 1).toArray()).toEqual([1, 0, border.minZ]);
  });

  it('refuses points off the grid or off the side', () => {
    expect(() => attachPoint(border, '+x', 0.3)).toThrow(/grid line/);
    expect(() => attachPoint(border, '+x', 1)).toThrow(/misses/);
  });
});

describe('distanceToRect', () => {
  it('is zero inside and grows outside', () => {
    const r = { minX: 0, maxX: 1, minZ: 0, maxZ: 1 };
    expect(distanceToRect(0.5, 0.5, r)).toBe(0);
    expect(distanceToRect(2, 0.5, r)).toBe(1);
    expect(distanceToRect(4, 5, r)).toBe(5);
  });
});
