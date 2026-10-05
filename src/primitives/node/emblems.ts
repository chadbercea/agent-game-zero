import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  type Material,
  type Object3D,
  QuadraticBezierCurve3,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { solid } from '../../core/mesh';

/** Act 1 systems: each has its own job animation. */
export type JobKind = 'figma' | 'github' | 'notion';
/** Act 2 systems, behind the Atlassian gate: their work flows through the Teamwork Graph instead. */
export type AtlassianKind = 'codesearch' | 'confluence' | 'jira' | 'bitbucket';
/** The systems a gate can lead to. */
export type SystemKind = JobKind | AtlassianKind;

export const JOB_KINDS: readonly JobKind[] = ['figma', 'github', 'notion'];
export const ATLASSIAN_KINDS: readonly AtlassianKind[] = ['codesearch', 'confluence', 'jira', 'bitbucket'];
export const SYSTEM_KINDS: readonly SystemKind[] = [...JOB_KINDS, ...ATLASSIAN_KINDS];

/** Does this system have a job animation? */
export function hasJob(kind: SystemKind): kind is JobKind {
  return (JOB_KINDS as readonly SystemKind[]).includes(kind);
}

export const SYSTEM_NAME: Record<SystemKind, string> = {
  figma: 'Figma',
  github: 'GitHub',
  notion: 'Notion',
  codesearch: 'Code search',
  confluence: 'Confluence',
  jira: 'Jira',
  bitbucket: 'Bitbucket',
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
  } else if (kind === 'codesearch') {
    // Search: a magnifier over a couple of lines of code.
    const lens = new Group();
    lens.position.set(-0.03, 0.04, 0);
    lens.add(solid(new TorusGeometry(0.13, 0.03, 8, 24), m.graphite));
    const line = new BoxGeometry(0.12, 0.022, 0.012);
    lens.add(place(solid(line, m.shell), 0, 0.03), place(solid(new BoxGeometry(0.08, 0.022, 0.012), m.shell), -0.02, -0.03));
    emblem.add(lens);
    const handle = place(solid(new CylinderGeometry(0.028, 0.028, 0.16, 8), m.graphite), 0.11, -0.13);
    handle.rotation.z = Math.PI / 4;
  } else if (kind === 'confluence') {
    // Shared knowledge: an open book standing up, two ruled pages in a V around a spine.
    const page = new BoxGeometry(0.2, 0.3, 0.012);
    for (const side of [-1, 1]) {
      const leaf = new Group();
      leaf.rotation.y = -side * 0.55; // pages open toward the viewer
      const sheet = solid(page, m.shell);
      sheet.position.x = side * 0.1;
      leaf.add(sheet);
      for (let i = 0; i < 4; i++) {
        const rule = solid(new BoxGeometry(i === 3 ? 0.08 : 0.13, 0.016, 0.006), m.graphite);
        rule.position.set(side * 0.1 - (i === 3 ? side * 0.025 : 0), 0.09 - i * 0.06, 0.009);
        leaf.add(rule);
      }
      emblem.add(leaf);
    }
    place(solid(new CylinderGeometry(0.016, 0.016, 0.32, 6), m.graphite), 0, 0);
  } else if (kind === 'jira') {
    // Tracked work: a tiny board, three columns of cards.
    const board = place(solid(new BoxGeometry(0.4, 0.3, 0.02), m.shell), 0, 0, -0.02);
    board.rotation.x = 0;
    const card = new BoxGeometry(0.09, 0.05, 0.016);
    const columns = [3, 2, 1];
    columns.forEach((n, c) => {
      for (let r = 0; r < n; r++) place(solid(card, c === 2 ? m.graphite : m.shell), -0.12 + c * 0.12, 0.09 - r * 0.075, 0.005);
    });
    for (let c = 0; c < 3; c++) place(solid(new BoxGeometry(0.1, 0.012, 0.012), m.graphite), -0.12 + c * 0.12, 0.135, 0.005);
  } else if (kind === 'bitbucket') {
    // Repositories: a bucket.
    place(solid(new CylinderGeometry(0.17, 0.12, 0.3, 8), m.shell), 0, 0);
    place(solid(new CylinderGeometry(0.175, 0.175, 0.03, 8), m.graphite), 0, 0.14);
    place(solid(new CylinderGeometry(0.135, 0.135, 0.03, 8), m.graphite), 0, -0.08);
  } else {
    // Docs: a small stack of ruled pages, the same pages the Notion job stacks up.
    const stack = new Group();
    stack.rotation.x = 0.95; // tipped toward the viewer so the top page reads
    emblem.add(stack);
    const page = new BoxGeometry(0.34, 0.014, 0.42);
    [0, 1, 2].forEach((i) => {
      const sheet = solid(page, m.shell);
      sheet.position.y = -0.03 + i * 0.026;
      sheet.rotation.y = (i - 1) * 0.07;
      stack.add(sheet);
    });
    const line = new BoxGeometry(0.22, 0.006, 0.026);
    for (let i = 0; i < 4; i++) {
      const rule = solid(line, m.graphite);
      rule.scale.x = i === 3 ? 0.6 : 1;
      rule.position.set(i === 3 ? -0.044 : 0, 0.03, -0.12 + i * 0.08);
      stack.add(rule);
    }
  }
  return emblem;
}

