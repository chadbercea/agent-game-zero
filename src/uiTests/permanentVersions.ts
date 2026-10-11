import { CylinderGeometry, ExtrudeGeometry, type Mesh, MeshStandardMaterial, Shape } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { NODE_FOOTPRINT } from '../core/grid';
import { at, solid } from '../core/mesh';
import { NEUTRAL } from '../core/palette';
import { PAD_TOP } from '../primitives/pad/Pad';
import { NODE_SCALE, type SystemNode } from '../primitives/node/SystemNode';

/**
 * Five ways a permanent system (a Teamwork Graph app that stays) could read
 * as permanent by its shape alone: no color, no plate under it, nothing
 * loose beside it. Each one changes the node's own body. UI test only; the
 * story doesn't use these yet.
 */
export const PERMANENT_VERSIONS = ['taller', 'cut-corners', 'raised-rim', 'corner-posts', 'seam-band'] as const;
export type PermanentVersion = (typeof PERMANENT_VERSIONS)[number];

export const VERSION_NAME: Record<PermanentVersion, string> = {
  taller: '1 · Stands taller',
  'cut-corners': '2 · Cut corners',
  'raised-rim': '3 · Raised rim',
  'corner-posts': '4 · Corner posts',
  'seam-band': '5 · Seam band',
};

export const VERSION_NOTE: Record<PermanentVersion, string> = {
  taller: 'The same slab, built up off the grid: a deeper body under the screen. Permanent things have mass.',
  'cut-corners': 'An octagonal slab instead of a square one: a different silhouette, so it reads as a different class of thing.',
  'raised-rim': 'A low wall around the top edge: the screen sits in a well, like something built in rather than set down.',
  'corner-posts': 'Four short posts at the corners, run into the slab and up past its top: anchored to the grid.',
  'seam-band': 'The slab split into two layers with a recessed graphite seam: machined, layered, structural.',
};

/** The pad's own width (before NODE_SCALE), and where its parts sit (see Pad). */
const W = NODE_FOOTPRINT / NODE_SCALE;
const SLAB_BOTTOM = 0.04;

/** Turn `node` into a permanent system, version `version`. Everything goes into the node's own pad. */
export function makePermanent(node: SystemNode, version: PermanentVersion): void {
  const pad = node.pad;
  const shell = new MeshStandardMaterial({ color: NEUTRAL.shell, roughness: 0.38, metalness: 0.05 });
  const graphite = new MeshStandardMaterial({ color: NEUTRAL.graphite, roughness: 0.4, metalness: 0.2 });
  // Pad children, in order: floor glow, skirt, slab, bezel, screen.
  const [, skirt, slab] = pad.children as Mesh[];

  switch (version) {
    case 'taller': {
      // One deeper slab (not a second one under it); the screen rides up on top.
      const lift = 0.3;
      const high = PAD_TOP - SLAB_BOTTOM + lift;
      slab.geometry = new RoundedBoxGeometry(W, high, W, 3, 0.07);
      slab.position.y = SLAB_BOTTOM + high / 2;
      for (const part of pad.children.slice(3)) part.position.y += lift;
      node.emblem.position.y += lift * NODE_SCALE;
      break;
    }
    case 'cut-corners': {
      slab.geometry = octagon(W, PAD_TOP - SLAB_BOTTOM, 0.05);
      slab.position.y = SLAB_BOTTOM;
      skirt.geometry = octagon(W - 0.04, 0.05, 0.02);
      skirt.position.y = 0.01;
      break;
    }
    case 'raised-rim': {
      const t = 0.08;
      const high = 0.1;
      for (const [w, d, x, z] of [
        [W, t, 0, -(W - t) / 2],
        [W, t, 0, (W - t) / 2],
        [t, W, -(W - t) / 2, 0],
        [t, W, (W - t) / 2, 0],
      ]) {
        const wall = solid(new RoundedBoxGeometry(w, high + 0.04, d, 2, 0.03), shell);
        wall.position.set(x, PAD_TOP + high / 2 - 0.02, z);
        pad.add(wall);
      }
      break;
    }
    case 'corner-posts': {
      const r = 0.12;
      const high = PAD_TOP + 0.16;
      const inset = W / 2 - r * 0.6;
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const post = solid(new CylinderGeometry(r, r, high, 24), shell);
        post.position.set(sx * inset, high / 2, sz * inset);
        pad.add(post);
        const cap = solid(new CylinderGeometry(r * 0.55, r * 0.55, 0.03, 24), graphite);
        cap.position.set(sx * inset, high + 0.015, sz * inset);
        pad.add(cap);
      }
      break;
    }
    case 'seam-band': {
      // The slab's sides cut in at mid-height: two white layers, a dark recessed seam between.
      slab.visible = false;
      const h = PAD_TOP - SLAB_BOTTOM;
      const seam = 0.05;
      const layer = (h - seam) / 2;
      pad.add(at(solid(new RoundedBoxGeometry(W, layer, W, 3, 0.03), shell), SLAB_BOTTOM + layer / 2));
      pad.add(at(solid(new RoundedBoxGeometry(W - 0.1, seam + 0.02, W - 0.1, 2, 0.02), graphite), SLAB_BOTTOM + layer + seam / 2));
      pad.add(at(solid(new RoundedBoxGeometry(W, layer, W, 3, 0.03), shell), PAD_TOP - layer / 2));
      break;
    }
  }
}

/** An octagonal slab, `width` across, `high` tall, its corners cut a third of the way in, softly beveled. */
function octagon(width: number, high: number, bevel: number): ExtrudeGeometry {
  const h = width / 2 - bevel;
  const c = h * 0.42;
  const shape = new Shape()
    .moveTo(-h + c, -h)
    .lineTo(h - c, -h)
    .lineTo(h, -h + c)
    .lineTo(h, h - c)
    .lineTo(h - c, h)
    .lineTo(-h + c, h)
    .lineTo(-h, h - c)
    .lineTo(-h, -h + c)
    .closePath();
  const geometry = new ExtrudeGeometry(shape, {
    depth: high - 2 * bevel,
    bevelEnabled: true,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
  });
  // Extruded along +z; stand it up so it rises along +y from y = 0.
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, bevel, 0);
  return geometry;
}
