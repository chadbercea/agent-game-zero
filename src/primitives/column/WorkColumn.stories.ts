import type { Meta, StoryObj } from '@storybook/html-vite';
import { GateAnimator } from '../../animation/GateAnimator';
import { Gate } from '../gate/Gate';
import { FACE_CAMERA, spawnDrone } from '../../stage/spawnDrone';
import { specimenStage } from '../../stage/specimen';
import { showWorkColumn } from '../../story/runJob';

const meta: Meta = {
  title: 'Primitives/Work Column',
  parameters: { layout: 'fullscreen' },
};
export default meta;

/** A working drone over an open gate: green, with its spinning cube, orbit arrows and dotted line. */
export const Working: StoryObj = {
  render: () => {
    const { root, stage } = specimenStage({ viewSize: 4.6, focusY: 1.3 });
    const gate = new Gate({ state: 'open' });
    gate.rotation.y = FACE_CAMERA;
    const gateAnimator = new GateAnimator(gate);
    stage.add(gate);
    stage.onTick((dt) => gateAnimator.update(dt));
    const { drone } = spawnDrone(stage, 0, 0, { name: 'D3V1N', showLabel: true, status: 'working' });
    showWorkColumn(stage, drone);
    return root;
  },
};
