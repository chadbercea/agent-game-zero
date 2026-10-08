import type { Meta, StoryObj } from '@storybook/html-vite';
import { Vector3 } from 'three';
import { BEND_RADIUS } from '../../core/grid';
import { NEUTRAL } from '../../core/palette';
import { specimenStage } from '../../stage/specimen';
import { tween, wait } from '../../story/timeline';
import { GraphEdge } from '../graph/GraphEdge';
import { Branch } from './Branch';
import { GRID_FADE } from './GridFade';
import { roundedPath } from './gridPath';

interface BranchArgs {
  /** Branch `drawn` (0–1): how much of the trace is drawn, from the gate end. */
  drawn: number;
  /** Keep the faint grid under it up (`grid.hold`); off, it lingers and fades. */
  holdGrid: boolean;
}

const unit = { control: { type: 'range', min: 0, max: 1, step: 0.01 } } as const;

const meta: Meta<BranchArgs> = {
  title: 'Primitives/Branch',
  parameters: { layout: 'fullscreen' },
  argTypes: { drawn: unit },
  args: { drawn: 1, holdGrid: true },
};
export default meta;

/**
 * Branch: a gate's trace out to one of its tools, gray dots along the grid,
 * over the faint grid that comes up as it draws. The controls set `drawn`
 * and whether the grid is held up (`holdGrid`); let go, it lingers and fades.
 */
export const Specimen: StoryObj<BranchArgs> = {
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 5, focusY: 0 });
    const line = [new Vector3(-2, 0, 1.5), new Vector3(-2, 0, -0.5), new Vector3(1.5, 0, -0.5)];
    const branch = new Branch(roundedPath(line, BEND_RADIUS), NEUTRAL.packet);
    stage.add(branch);
    branch.drawn = args.drawn;
    branch.grid.hold(args.holdGrid);
    return root;
  },
};

/**
 * The grid-under-lines rule (ILI-968), on loop: one rule for every line on
 * the floor. A trace draws and the faint grid comes up under it; once it's
 * drawn, the grid lingers a moment and fades. Then a Teamwork Graph line does
 * the same, overlapping the first: each line has its own patch, so they never
 * fight over the grid. No captions.
 */
export const GridUnderLines: StoryObj = {
  render: () => {
    const { root, stage } = specimenStage({ viewSize: 6, focusY: 0 });
    const branch = new Branch(
      roundedPath([new Vector3(-2.5, 0, 1.5), new Vector3(-2.5, 0, -0.5), new Vector3(1, 0, -0.5)], BEND_RADIUS),
      NEUTRAL.packet,
    );
    const edge = new GraphEdge(roundedPath([new Vector3(-1, 0, 2), new Vector3(2, 0, 2), new Vector3(2, 0, -1.5)], BEND_RADIUS));
    stage.add(branch, edge);
    stage.onTick((dt) => edge.update(dt));
    void (async () => {
      for (;;) {
        branch.drawn = 0;
        edge.drawn = 0;
        await wait(stage, 0.6);
        await tween(stage, 1.2, (t) => (branch.drawn = t));
        await wait(stage, 0.5);
        await tween(stage, 1.2, (t) => (edge.drawn = Math.max(0.001, t)));
        // Both lines stay; their grid lingers, then fades on its own.
        await wait(stage, GRID_FADE.linger + GRID_FADE.out + 1.5);
      }
    })();
    return root;
  },
};
