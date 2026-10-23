import type { Meta, StoryObj } from '@storybook/html-vite';
import { Vector3 } from 'three';
import { BEND_RADIUS } from '../../core/grid';
import { specimenStage } from '../../stage/specimen';
import { roundedPath } from '../branch/gridPath';
import { GraphEdge } from '../graph/GraphEdge';
import { GroundUnit } from './GroundUnit';
import { attachPoint } from './unitLayout';

const meta: Meta = {
  title: 'Primitives/Grounded Unit',
  parameters: { layout: 'fullscreen' },
};
export default meta;

/**
 * Two grounded units (ILI-1070), one each way: GitHub's panel runs along X,
 * Jira's runs below it along Z, and both nodes keep the upper-left corner.
 * Two graph lines join them border to border, each on its own grid line and
 * its own attach point; the grid under them stays off the units.
 */
export const Specimen: StoryObj = {
  render: () => {
    const { root, stage } = specimenStage({ viewSize: 7.5, focusY: 0 });
    stage.centerOn(new Vector3(4, 0, 0.6));
    const github = new GroundUnit({
      kind: 'github',
      direction: 'x',
      panel: { name: 'GitHub', system: 'Atlassian grid', light: 'working', makes: 'Pull requests', linked: ['Jira', 'Bitbucket'] },
    });
    github.node.light = 'working';
    const jira = new GroundUnit({
      kind: 'jira',
      direction: 'z',
      panel: { name: 'Jira', system: 'Atlassian grid', light: 'off', makes: 'Work items', linked: ['GitHub', 'Confluence'] },
    });
    jira.position.set(7, 0, 0);
    stage.add(github, jira);

    const clear = [github.footprint, jira.footprint];
    for (const at of [-0.5, 0.5]) {
      const from = attachPoint(github.footprint, '+x', at);
      const to = attachPoint(jira.footprint, '-x', at);
      const edge = new GraphEdge(roundedPath([from, to], BEND_RADIUS), clear);
      edge.drawn = 1;
      edge.grid.hold(true);
      stage.add(edge);
      stage.onTick((dt) => edge.update(dt));
    }
    return root;
  },
};
