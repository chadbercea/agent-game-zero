import { describe, expect, it } from 'vitest';
import { Mesh, type MeshStandardMaterial } from 'three';
import { LINEAGE, NEUTRAL, STATUS_COLOR } from '../../core/palette';
import { SystemNode } from './SystemNode';

/** The ring's material: the puck's emissive torus. */
const ring = (n: SystemNode) =>
  (n.base.children.find((c) => c instanceof Mesh && c.geometry.type === 'TorusGeometry') as Mesh).material as MeshStandardMaterial;

describe('SystemNode, Puck (ILI-982)', () => {
  it('is a round puck, not a square pad: a cylinder base with a ring', () => {
    const n = new SystemNode({ kind: 'jira', showLabel: false });
    const kinds = n.base.children.map((c) => (c as Mesh).geometry.type);
    expect(kinds).toEqual(['CylinderGeometry', 'TorusGeometry']);
    expect(n.emblem.visible).toBe(true);
  });

  it('lights its ring with its state: gray off, the status color in use', () => {
    const n = new SystemNode({ kind: 'jira', showLabel: false });
    expect(ring(n).color.equals(NEUTRAL.offLight)).toBe(true);
    n.light = 'working';
    expect(ring(n).color.equals(STATUS_COLOR.working)).toBe(true);
    n.light = 'waiting';
    expect(ring(n).color.equals(STATUS_COLOR.waiting)).toBe(true);
  });

  it('as a tertiary: no emblem, its ring in the owner’s color, brighter while worked', () => {
    const t = new SystemNode({ kind: 'jira', showLabel: false, tertiaryOf: 'violet' });
    expect(t.emblem.visible).toBe(false);
    expect(t.owner).toBe('violet');
    expect(ring(t).color.equals(LINEAGE.violet)).toBe(true);
    const idle = ring(t).emissiveIntensity;
    t.light = 'working';
    expect(ring(t).color.equals(LINEAGE.violet)).toBe(true);
    expect(ring(t).emissiveIntensity).toBeGreaterThan(idle);
  });
});
