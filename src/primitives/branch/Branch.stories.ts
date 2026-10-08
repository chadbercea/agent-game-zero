import type { Meta, StoryObj } from '@storybook/html-vite';
import { Vector3 } from 'three';
import { BEND_RADIUS } from '../../core/grid';
import { NEUTRAL } from '../../core/palette';
import { specimenStage } from '../../stage/specimen';
import { Branch } from './Branch';
import { GridPatch } from './GridPatch';
import { roundedPath } from './gridPath';

interface BranchArgs {
  /** Branch `drawn` (0–1): how much of the trace is drawn, from the gate end. */
  drawn: number;
  /** GridPatch `opacity` (0–1): the faint grid under the trace. */
  patch: number;
}

const unit = { control: { type: 'range', min: 0, max: 1, step: 0.01 } } as const;

const meta: Meta<BranchArgs> = {
  title: 'Primitives/Branch',
  parameters: { layout: 'fullscreen' },
  argTypes: { drawn: unit, patch: unit },
  args: { drawn: 1, patch: 1 },
};
export default meta;

/**
 * Branch: a gate's trace out to one of its tools, gray dots along the grid,
 * over a GridPatch (the faint grid that draws in and fades with it). The
 * controls set the Branch's `drawn` and the GridPatch's `opacity`.
 */
export const Specimen: StoryObj<BranchArgs> = {
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 5, focusY: 0 });
    const line = [new Vector3(-2, 0, 1.5), new Vector3(-2, 0, -0.5), new Vector3(1.5, 0, -0.5)];
    const patch = new GridPatch(line);
    patch.opacity = args.patch;
    const branch = new Branch(roundedPath(line, BEND_RADIUS), NEUTRAL.packet);
    branch.drawn = args.drawn;
    stage.add(patch, branch);
    return root;
  },
};
