import { Color, InstancedMesh, Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { STATUS_COLOR } from '../../core/palette';
import { GRAPH_COLOR } from '../graph/GraphEdge';
import { Conduit } from './Conduit';

const run = { along: 'x' as const, from: 0, to: 20, low: 0, high: 0.5 };
const streams = (c: Conduit) => c.children.find((o): o is InstancedMesh => o instanceof InstancedMesh)!;

describe('Conduit streams', () => {
  it('are mostly green and blue, some yellow, least red', () => {
    const mesh = streams(new Conduit(run));
    const count = new Map<string, number>();
    const color = new Color();
    for (let i = 0; i < mesh.count; i++) {
      mesh.getColorAt(i, color);
      count.set(color.getHexString(), (count.get(color.getHexString()) ?? 0) + 1);
    }
    const n = (c: Color) => count.get(c.getHexString()) ?? 0;
    const [green, blue, yellow, red] = [
      STATUS_COLOR.working,
      GRAPH_COLOR,
      STATUS_COLOR.waiting,
      STATUS_COLOR.stopped,
    ].map(n);
    expect(green + blue).toBeGreaterThan(0.7 * mesh.count);
    expect(yellow).toBeGreaterThan(red);
    expect(red).toBeGreaterThan(0);
  });

  it('flow, and stay inside the glass', () => {
    const conduit = new Conduit(run);
    conduit.level = 1;
    const mesh = streams(conduit);
    const m = new Matrix4();
    const p = new Vector3();
    mesh.getMatrixAt(0, m);
    const before = p.setFromMatrixPosition(m).x;
    conduit.update(0.1);
    mesh.getMatrixAt(0, m);
    expect(p.setFromMatrixPosition(m).x).not.toBeCloseTo(before, 5);
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m);
      p.setFromMatrixPosition(m);
      expect(Math.abs(p.x)).toBeLessThanOrEqual(10);
      expect(Math.abs(p.z)).toBeLessThanOrEqual(0.5);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(0.26);
    }
  });
});
