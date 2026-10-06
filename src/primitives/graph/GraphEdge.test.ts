import { InstancedMesh, LineCurve3, Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { FLOW_SPEED, GraphEdge } from './GraphEdge';

const firstDot = (edge: GraphEdge) => {
  const dots = edge.children.find((c): c is InstancedMesh => c instanceof InstancedMesh)!;
  const m = new Matrix4();
  dots.getMatrixAt(1, m);
  return new Vector3().setFromMatrixPosition(m);
};

describe('GraphEdge', () => {
  it('is a line of dots that marches from its start toward its end', () => {
    const edge = new GraphEdge(new LineCurve3(new Vector3(0, 0, 0), new Vector3(4, 0, 0)));
    edge.drawn = 1;
    const before = firstDot(edge).x;
    edge.update(0.1);
    expect(firstDot(edge).x - before).toBeCloseTo(FLOW_SPEED * 0.1, 5);
  });

  it('is hidden until drawn', () => {
    const edge = new GraphEdge(new LineCurve3(new Vector3(0, 0, 0), new Vector3(4, 0, 0)));
    expect(edge.visible).toBe(false);
    edge.drawn = 0.5;
    expect(edge.visible).toBe(true);
  });
});
