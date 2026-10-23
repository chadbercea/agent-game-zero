import type { Meta, StoryObj } from '@storybook/html-vite';
import { MathUtils, Vector3 } from 'three';
import { BEND_RADIUS } from '../../core/grid';
import { specimenStage } from '../../stage/specimen';
import { roundedPath } from '../branch/gridPath';
import { GraphEdge } from '../graph/GraphEdge';
import { SystemNode } from '../node/SystemNode';
import { GroundPanel, type GroundPanelData } from './GroundPanel';
import { attachPoint, pickAttachments } from './unitLayout';

interface GroundPanelArgs {
  /** Draw-in (0–1): GitHub's unit comes up, the lines draw to Jira's border, then Jira's unit comes up. Back down folds it away in reverse. */
  drawIn: number;
}

const meta: Meta<GroundPanelArgs> = {
  title: 'Primitives/Grounded Unit',
  parameters: { layout: 'fullscreen' },
  argTypes: { drawIn: { control: { type: 'range', min: 0, max: 1, step: 0.01 } } },
  args: { drawIn: 1 },
};
export default meta;

/** Nodes come up with this overshoot (the stories' easeOutBack). */
function easeOutBack(t: number): number {
  const c = 1.6;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}

/** How far through `[from, to]` the draw-in is (0–1). */
const phase = (t: number, from: number, to: number) => MathUtils.clamp((t - from) / (to - from), 0, 1);

/**
 * Two grounded units (ILI-1070), each a system node with its ground panel, one each way: GitHub's panel runs along X,
 * Jira's runs below it along Z, and both nodes keep the upper-left corner.
 * Two graph lines join them border to border; their attach points are picked
 * (the side facing Jira, the nearest free grid lines). The grid under the
 * lines stays off each unit while it's up. `drawIn` steps through the order:
 * unit, line, then the unit at its end.
 */
export const Specimen: StoryObj<GroundPanelArgs> = {
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 7.5, focusY: 0 });
    stage.centerOn(new Vector3(4, 0, 0.6));
    const unit = (kind: 'github' | 'jira', direction: 'x' | 'z', facts: Omit<GroundPanelData, 'light'>) => {
      const node = new SystemNode({ kind, showLabel: false });
      const ground = new GroundPanel(node, { direction, data: () => ({ ...facts, light: node.light }) });
      stage.add(node);
      return { node, ground };
    };
    const github = unit('github', 'x', { name: 'GitHub', system: 'Atlassian grid', makes: 'Pull requests', linked: ['Jira', 'Bitbucket'] });
    github.node.light = 'working';
    const jira = unit('jira', 'z', { name: 'Jira', system: 'Atlassian grid', makes: 'Work items', linked: ['GitHub', 'Confluence'] });
    jira.node.position.set(7, 0, 0);

    const leaving = pickAttachments(github.ground.footprint, [jira.node.position, jira.node.position]);
    const edges = leaving.map(({ point }) => {
      const to = attachPoint(jira.ground.footprint, '-x', point.z);
      const edge = new GraphEdge(roundedPath([point, to], BEND_RADIUS));
      edge.grid.hold(true);
      stage.add(edge);
      stage.onTick((dt) => edge.update(dt));
      return edge;
    });

    const t = args.drawIn;
    github.node.scale.setScalar(Math.max(0.001, easeOutBack(phase(t, 0, 0.25))));
    for (const edge of edges) edge.drawn = phase(t, 0.3, 0.7);
    jira.node.scale.setScalar(Math.max(0.001, easeOutBack(phase(t, 0.75, 1))));
    return root;
  },
};
