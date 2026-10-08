import {
  BoxGeometry,
  type BufferGeometry,
  CylinderGeometry,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FACE_CAMERA } from '../../core/grid';
import { NEUTRAL } from '../../core/palette';
import { type SystemKind, SYSTEM_KINDS } from '../node/emblems';

/** What each system produces, in words. */
export const PRODUCT_NAME: Record<SystemKind, string> = {
  figma: 'Design',
  github: 'Commit',
  notion: 'Page',
  confluence: 'Spec',
  jira: 'Issue',
  bitbucket: 'Pull request',
  codesearch: 'Code context',
  linear: 'Issue',
};

/** About the size of the old work cube: small enough to ride a line, big enough to read. */
export const PRODUCT_SIZE = 0.24;

const cache = new Map<SystemKind, BufferGeometry>();

/**
 * One work product's shape, by the system it comes from, as a single merged
 * geometry about PRODUCT_SIZE across, centered at its origin and facing +z.
 * Products are neutral like packets (information, not identity); they're told
 * apart by shape, the way the node emblems are:
 * - Figma: a design, blocks and a dot like the Figma emblem
 * - GitHub: a commit, a dot on a short branch
 * - Notion: a page with ruled lines
 * - Confluence: a spec, three sheets fanned out
 * - Jira: an issue, a landscape card with a key chip
 * - Bitbucket: a pull request, two dots joined into one
 * - Code search: code context, a lens
 * - Linear: an issue, a square card with a status ring
 */
export function productGeometry(kind: SystemKind): BufferGeometry {
  const hit = cache.get(kind);
  if (hit) return hit;
  const parts: BufferGeometry[] = [];
  const add = (g: BufferGeometry, x = 0, y = 0, z = 0, rz = 0) => {
    g.applyMatrix4(new Matrix4().makeRotationZ(rz).setPosition(x, y, z));
    parts.push(g.index ? g.toNonIndexed() : g);
  };
  const s = PRODUCT_SIZE;
  if (kind === 'figma') {
    // Like the Figma emblem: a column of rounded blocks beside a block and a dot.
    const block = () => new RoundedBoxGeometry(s * 0.36, s * 0.32, s * 0.16, 2, s * 0.08);
    add(block(), -s * 0.2, s * 0.34);
    add(block(), -s * 0.2, 0);
    add(block(), -s * 0.2, -s * 0.34);
    add(block(), s * 0.2, s * 0.34);
    add(new SphereGeometry(s * 0.17, 12, 8), s * 0.2, 0);
  } else if (kind === 'github') {
    add(new SphereGeometry(s * 0.3, 14, 10), 0, s * 0.12);
    add(new CylinderGeometry(s * 0.08, s * 0.08, s * 0.9, 8), 0, -s * 0.05);
  } else if (kind === 'notion') {
    add(new BoxGeometry(s * 0.78, s, s * 0.08));
    for (let i = 0; i < 3; i++) add(new BoxGeometry(s * 0.52, s * 0.06, s * 0.06), 0, s * (0.22 - i * 0.2), s * 0.06);
  } else if (kind === 'confluence') {
    // Three sheets fanned out from the bottom, the front one ruled.
    for (let i = 0; i < 3; i++) add(new BoxGeometry(s * 0.66, s * 0.86, s * 0.05), s * (i - 1) * 0.18, 0, -i * s * 0.08, (1 - i) * 0.28);
    for (let i = 0; i < 2; i++) add(new BoxGeometry(s * 0.4, s * 0.05, s * 0.05), -s * 0.2, s * (0.14 - i * 0.16), s * 0.05, 0.28);
  } else if (kind === 'jira') {
    add(new RoundedBoxGeometry(s * 1.1, s * 0.72, s * 0.1, 2, s * 0.06));
    add(new BoxGeometry(s * 0.34, s * 0.12, s * 0.08), -s * 0.24, s * 0.16, s * 0.07);
    add(new BoxGeometry(s * 0.7, s * 0.07, s * 0.06), -s * 0.05, -s * 0.08, s * 0.07);
  } else if (kind === 'bitbucket') {
    add(new SphereGeometry(s * 0.2, 12, 8), -s * 0.3, s * 0.3);
    add(new SphereGeometry(s * 0.2, 12, 8), s * 0.3, s * 0.3);
    add(new SphereGeometry(s * 0.24, 12, 8), 0, -s * 0.32);
    add(new CylinderGeometry(s * 0.07, s * 0.07, s * 0.7, 8), -s * 0.15, 0, 0, 0.5);
    add(new CylinderGeometry(s * 0.07, s * 0.07, s * 0.7, 8), s * 0.15, 0, 0, -0.5);
  } else if (kind === 'linear') {
    add(new RoundedBoxGeometry(s * 0.86, s * 0.86, s * 0.1, 2, s * 0.08));
    add(new TorusGeometry(s * 0.13, s * 0.04, 6, 16), -s * 0.18, s * 0.18, s * 0.07);
    add(new BoxGeometry(s * 0.56, s * 0.07, s * 0.06), 0, -s * 0.1, s * 0.07);
    add(new BoxGeometry(s * 0.36, s * 0.07, s * 0.06), -s * 0.1, -s * 0.26, s * 0.07);
  } else {
    add(new TorusGeometry(s * 0.3, s * 0.08, 8, 20), -s * 0.08, s * 0.1);
    add(new CylinderGeometry(s * 0.08, s * 0.08, s * 0.45, 8), s * 0.26, -s * 0.3, 0, 0.8);
  }
  const merged = mergeGeometries(parts);
  if (!merged) throw new Error(`productGeometry: could not merge the ${kind} product`);
  merged.computeVertexNormals();
  cache.set(kind, merged);
  return merged;
}

/** A fresh neutral material for one product (its own, so a highway glow on one doesn't light the rest). */
export function productMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({ color: NEUTRAL.packet, roughness: 0.45, flatShading: true });
}

/**
 * Product primitive: one system's work product as a mesh, turned to face the
 * isometric camera so its shape reads. Its material is its own.
 */
export class Product extends Mesh<BufferGeometry, MeshStandardMaterial> {
  constructor(readonly kind: SystemKind) {
    super(productGeometry(kind), productMaterial());
    this.castShadow = true;
    this.rotation.y = FACE_CAMERA;
  }

  dispose(): void {
    this.removeFromParent();
    this.material.dispose();
  }
}

/** Every product kind, for specimens. */
export const PRODUCT_KINDS: readonly SystemKind[] = SYSTEM_KINDS;
