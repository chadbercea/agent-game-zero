import type { Meta, StoryObj } from '@storybook/html-vite';
import { GateAnimator } from '../../animation/GateAnimator';
import type { Stage } from '../../stage/Stage';
import { FACE_CAMERA } from '../../stage/spawnDrone';
import { rowPosition, specimenStage } from '../../stage/specimen';
import { GATE_STATES, Gate, type GateState } from './Gate';

interface GateArgs {
  state: GateState;
}

const meta: Meta<GateArgs> = {
  title: 'Primitives/Gate',
  parameters: { layout: 'fullscreen' },
  argTypes: { state: { control: 'inline-radio', options: GATE_STATES } },
  args: { state: 'thinking' },
};
export default meta;

type Story = StoryObj<GateArgs>;

function placeGate(stage: Stage, x: number, z: number, state: GateState): Gate {
  const gate = new Gate({ state });
  gate.position.set(x, 0, z);
  gate.rotation.y = FACE_CAMERA;
  const animator = new GateAnimator(gate);
  stage.add(gate);
  stage.onTick((dt) => animator.update(dt));
  return gate;
}

/** One gate; pick its state. */
export const Specimen: Story = {
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 3, focusY: 0.2 });
    placeGate(stage, 0, 0, args.state);
    return root;
  },
};

/** Off · Thinking · Open · Denied. */
export const States: Story = {
  render: () => {
    const { root, stage } = specimenStage({ viewSize: 4.5, focusY: 0.2 });
    GATE_STATES.forEach((state, i) => {
      const { x, z } = rowPosition(i, GATE_STATES.length, 2.2);
      placeGate(stage, x, z, state);
    });
    return root;
  },
};

/** An access check on loop: off → thinking → open, then off → thinking → denied. */
export const Check: Story = {
  render: () => {
    const { root, stage } = specimenStage({ viewSize: 3, focusY: 0.2 });
    const gate = placeGate(stage, 0, 0, 'off');
    const script: [GateState, number][] = [
      ['off', 1.2],
      ['thinking', 2.4],
      ['open', 2.5],
      ['off', 1.2],
      ['thinking', 2.4],
      ['denied', 2.5],
    ];
    let step = 0;
    let clock = 0;
    stage.onTick((dt) => {
      clock += dt;
      if (clock < script[step][1]) return;
      clock = 0;
      step = (step + 1) % script.length;
      gate.state = script[step][0];
    });
    return root;
  },
};
