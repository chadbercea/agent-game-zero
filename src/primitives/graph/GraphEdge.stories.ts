import type { Meta, StoryObj } from '@storybook/html-vite';
import { Vector3 } from 'three';
import { BEND_RADIUS } from '../../core/grid';
import { specimenStage } from '../../stage/specimen';
import { roundedPath } from '../branch/gridPath';
import { GraphEdge } from './GraphEdge';

interface GraphEdgeArgs {
  /** `drawn` (0–1): how much of the line is drawn in, from its start. */
  drawn: number;
}

const meta: Meta<GraphEdgeArgs> = {
  title: 'Primitives/Graph Line',
  parameters: { layout: 'fullscreen' },
  argTypes: { drawn: { control: { type: 'range', min: 0, max: 1, step: 0.01 } } },
  args: { drawn: 1 },
};
export default meta;

/**
 * GraphEdge: one Teamwork Graph line, blue dots marching along the floor
 * grid (one L-shaped run here). The control sets `drawn`.
 */
export const Specimen: StoryObj<GraphEdgeArgs> = {
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 5, focusY: 0 });
    const edge = new GraphEdge(roundedPath([new Vector3(-2, 0, 1), new Vector3(1, 0, 1), new Vector3(1, 0, -2)], BEND_RADIUS));
    edge.drawn = args.drawn;
    stage.add(edge);
    stage.onTick((dt) => edge.update(dt));
    return root;
  },
};
