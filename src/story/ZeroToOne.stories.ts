import type { Meta, StoryObj } from '@storybook/html-vite';
import { Vector3 } from 'three';
import type { SystemKind } from '../primitives/node/emblems';
import { SystemNode } from '../primitives/node/SystemNode';
import { specimenStage } from '../stage/specimen';
import { tween, wait } from './timeline';

const meta: Meta = {
  title: 'Story Parts/Zero To One',
  parameters: { layout: 'fullscreen' },
};
export default meta;

/** The first tool goes at the origin; the rest grow out from it, in order. */
const GROWTH: [SystemKind, number, number][] = [
  ['jira', 0, 0],
  ['confluence', 0, -2.5],
  ['bitbucket', 2.5, 0],
  ['codesearch', 2.5, -2.5],
  ['figma', -2.5, 0],
  ['notion', -2.5, -2.5],
  ['github', 0, 2.5],
  ['linear', 2.5, 2.5],
];

/**
 * Zero to one (ILI-977), on loop: an empty grid; the first thing placed pops
 * up dead center of the view; then the system grows out from it, one tool
 * at a time, past the edges if it gets big. The camera never moves. No
 * captions.
 */
export const Build: StoryObj = {
  render: () => {
    const { root, stage } = specimenStage({ viewSize: 8, focusY: 0.5 });
    // Framed once on the origin, where the first thing goes, and never moved.
    stage.centerOn(new Vector3(0, 0.5, 0));
    const nodes = GROWTH.map(([kind, x, z]) => {
      const node = new SystemNode({ kind });
      node.position.set(x, 0, z);
      node.visible = false;
      stage.add(node);
      return node;
    });
    Object.assign(window, { __nodes: nodes });
    void (async () => {
      for (;;) {
        for (const node of nodes) {
          node.visible = true;
          await tween(stage, 0.45, (t) => node.scale.setScalar(Math.max(0.001, t + Math.sin(t * Math.PI) * 0.12)));
          await wait(stage, nodes.indexOf(node) === 0 ? 1.4 : 0.5);
        }
        await wait(stage, 2);
        await tween(stage, 0.5, (t) => nodes.forEach((n) => n.scale.setScalar(Math.max(0.001, 1 - t))));
        nodes.forEach((n) => (n.visible = false));
        await wait(stage, 0.8);
      }
    })();
    return root;
  },
};
