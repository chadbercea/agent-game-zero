import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { graphLinks } from './TeamworkGraph';

describe('graphLinks', () => {
  const left = [new Vector3(0, 0, 0), new Vector3(-3, 0, -1), new Vector3(-1, 0, -4)];
  const right = [new Vector3(8, 0, -8), new Vector3(6, 0, -10), new Vector3(9, 0, -12), new Vector3(5, 0, -13)];
  const links = graphLinks([...left, ...right]);

  it('is a spanning tree: every node connected, no loops', () => {
    expect(links).toHaveLength(6);
    const root = [0, 1, 2, 3, 4, 5, 6];
    const find = (i: number): number => (root[i] === i ? i : find(root[i]));
    for (const [a, b] of links) root[find(a)] = find(b);
    expect(new Set(root.map(find)).size).toBe(1);
  });

  it('joins the two systems by their closest pair', () => {
    const all = [...left, ...right];
    const dist = (a: number, b: number) => Math.abs(all[a].x - all[b].x) + Math.abs(all[a].z - all[b].z);
    const cross = links.filter(([a, b]) => (a < 3) !== (b < 3));
    expect(cross).toHaveLength(1);
    const closest = Math.min(...[0, 1, 2].flatMap((a) => [3, 4, 5, 6].map((b) => dist(a, b))));
    expect(dist(...cross[0])).toBe(closest);
  });
});
