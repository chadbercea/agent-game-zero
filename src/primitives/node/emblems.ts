import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  type Material,
  type Object3D,
  QuadraticBezierCurve3,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { solid } from '../../core/mesh';

/** The systems a gate can lead to. */
export type SystemKind = 'figma' | 'github' | 'notion';

export const SYSTEM_KINDS: readonly SystemKind[] = ['figma', 'github', 'notion'];

export const SYSTEM_NAME: Record<SystemKind, string> = {
  figma: 'Figma',
  github: 'GitHub',
  notion: 'Notion',
};

export interface EmblemMaterials {
  shell: Material;
  graphite: Material;
}

/**
 * A small low-poly emblem per system, in the scene's white + graphite. The
 * systems are told apart by shape, not brand color, so color stays reserved
 * for status and lineage. Each emblem is ~0.5 units tall, centered at its origin.
 */
export function buildEmblem(kind: SystemKind, m: EmblemMaterials): Group {
  const emblem = new Group();
  emblem.name = `emblem:${kind}`;
  const place = (o: Object3D, x: number, y: number, z = 0) => {
    o.position.set(x, y, z);
    emblem.add(o);
    return o;
  };

  if (kind === 'figma') {
    // Design: a column of rounded blocks beside a block and a sphere, in the spirit of Figma's mark.
    const block = new RoundedBoxGeometry(0.16, 0.16, 0.08, 2, 0.05);
    place(solid(block, m.shell), -0.085, 0.17);
    place(solid(block, m.shell), -0.085, 0);
    place(solid(block, m.graphite), -0.085, -0.17);
    place(solid(block, m.shell), 0.085, 0.17);
    place(solid(new SphereGeometry(0.08, 12, 8), m.graphite), 0.085, 0);
  } else if (kind === 'github') {
    // Code: a branch glyph. A trunk with two commits, and a fork curving off it.
    const commit = new SphereGeometry(0.06, 12, 8);
    place(solid(new CylinderGeometry(0.024, 0.024, 0.42, 8), m.graphite), -0.07, 0);
    place(solid(commit, m.shell), -0.07, 0.2);
    place(solid(commit, m.shell), -0.07, -0.2);
    const fork = new QuadraticBezierCurve3(new Vector3(-0.07, -0.08, 0), new Vector3(0.12, -0.04, 0), new Vector3(0.12, 0.14, 0));
    place(solid(new TubeGeometry(fork, 12, 0.022, 6), m.graphite), 0, 0);
    place(solid(commit, m.shell), 0.12, 0.17);
  } else {
    // Docs: a small stack of pages, the top one ruled with lines of text.
    const page = new BoxGeometry(0.34, 0.42, 0.03);
    place(solid(page, m.shell), 0.03, -0.02, -0.05);
    place(solid(page, m.shell), 0, 0, 0);
    const line = new BoxGeometry(0.22, 0.025, 0.012);
    for (let i = 0; i < 4; i++) place(solid(line, m.graphite), -0.02 + (i === 3 ? -0.03 : 0), 0.12 - i * 0.075, 0.02);
    place(solid(new BoxGeometry(0.08, 0.08, 0.012), m.graphite), -0.08, -0.15, 0.02);
  }
  return emblem;
}

