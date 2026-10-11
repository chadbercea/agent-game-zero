import type { Meta, StoryObj } from '@storybook/html-vite';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { FACE_CAMERA, NODE_FOOTPRINT } from '../core/grid';
import type { SystemKind } from '../primitives/node/emblems';
import { SystemNode } from '../primitives/node/SystemNode';
import { rowPosition, specimenStage } from '../stage/specimen';
import { makePermanent, PERMANENT_VERSIONS, type PermanentVersion, VERSION_NAME, VERSION_NOTE } from './permanentVersions';

const meta: Meta = {
  title: 'UI Tests/Permanent Systems',
  parameters: { layout: 'fullscreen' },
};
export default meta;

/** The Teamwork Graph apps that stay, and third-party tools that come and go (plain nodes, for contrast). */
const PERMANENT: SystemKind[] = ['jira', 'confluence', 'bitbucket', 'codesearch'];
const PASSING: SystemKind[] = ['figma', 'notion'];

/** A caption under a node, past its name. */
function caption(text: string): CSS2DObject {
  const el = document.createElement('div');
  el.textContent = text;
  Object.assign(el.style, {
    font: '600 12px/1 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
    color: '#1d1e22',
    whiteSpace: 'nowrap',
  } satisfies Partial<CSSStyleDeclaration>);
  const label = new CSS2DObject(el);
  const front = NODE_FOOTPRINT * 1.05;
  label.position.set(Math.sin(FACE_CAMERA) * front, -0.05, Math.cos(FACE_CAMERA) * front);
  return label;
}

/**
 * All five side by side, on Confluence, with a plain node (Figma, a
 * third-party tool that comes and goes) at the left for contrast. Each
 * version changes only the node's own body: no color, no plate, nothing
 * loose beside it.
 */
export const SideBySide: StoryObj = {
  name: 'All five, side by side',
  render: () => {
    const { root, stage } = specimenStage({ viewSize: 6.6, focusY: 0.5 });
    const row: (PermanentVersion | null)[] = [null, ...PERMANENT_VERSIONS];
    row.forEach((version, i) => {
      const node = new SystemNode({ kind: version ? 'confluence' : 'figma' });
      if (version) makePermanent(node, version);
      const { x, z } = rowPosition(i, row.length, 1.75);
      node.position.set(x, 0, z);
      node.add(caption(version ? VERSION_NAME[version] : 'Plain (comes and goes)'));
      stage.add(node);
    });
    return root;
  },
};

/** One version on every permanent app, beside two plain third-party tools. */
function version(v: PermanentVersion): StoryObj {
  return {
    name: VERSION_NAME[v],
    parameters: { docs: { description: { story: VERSION_NOTE[v] } } },
    render: () => {
      const { root, stage } = specimenStage({ viewSize: 6, focusY: 0.5 });
      const row = [...PERMANENT, ...PASSING];
      row.forEach((kind, i) => {
        const node = new SystemNode({ kind });
        if (PERMANENT.includes(kind)) makePermanent(node, v);
        if (kind === 'jira') node.light = 'working';
        const { x, z } = rowPosition(i, row.length, 1.7);
        node.position.set(x, 0, z);
        stage.add(node);
      });
      return root;
    },
  };
}

/** The same slab, built up off the grid: a deeper body under the screen. */
export const Taller = version('taller');
/** An octagonal slab instead of a square one: a different silhouette. */
export const CutCorners = version('cut-corners');
/** A low wall around the top edge: the screen sits in a well. */
export const RaisedRim = version('raised-rim');
/** Four short posts at the corners, run into the slab and up past its top. */
export const CornerPosts = version('corner-posts');
/** The slab in two layers with a recessed graphite seam between. */
export const SeamBand = version('seam-band');
