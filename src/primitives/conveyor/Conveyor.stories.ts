import type { Meta, StoryObj } from '@storybook/html-vite';
import { BoxGeometry, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { NEUTRAL } from '../../core/palette';
import { SCREEN_RIGHT, specimenStage } from '../../stage/specimen';
import { BELT_TOP, Conveyor } from './Conveyor';

const meta: Meta = {
  title: 'Primitives/Conveyor',
  parameters: { layout: 'fullscreen' },
};
export default meta;

/**
 * A belt running, with a block riding it end to end on a loop. Controls set
 * the Conveyor's `length` (constructor) and `speed` (world units per second;
 * the block rides at the belt's speed). Defaults match the live story.
 */
export const Running: StoryObj<{ length: number; speed: number }> = {
  argTypes: {
    length: { control: { type: 'range', min: 1, max: 6, step: 0.5 } },
    speed: { control: { type: 'range', min: 0.2, max: 4, step: 0.1 } },
  },
  args: { length: 2, speed: 2.2 },
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 4.5, focusY: 0.3 });
    const belt = new Conveyor(args.length);
    belt.speed = args.speed;
    belt.position.copy(SCREEN_RIGHT).multiplyScalar(-args.length / 2);
    belt.rotation.y = Math.atan2(-SCREEN_RIGHT.z, SCREEN_RIGHT.x);
    stage.add(belt);
    const block = new Mesh(new BoxGeometry(0.36, 0.36, 0.36), new MeshStandardMaterial({ color: NEUTRAL.packet, flatShading: true }));
    block.castShadow = true;
    stage.add(block);
    let t = 0;
    const at = new Vector3();
    stage.onTick((dt) => {
      belt.update(dt);
      t = (t + (dt * belt.speed) / belt.length) % 1;
      belt.pointAt(t, at);
      block.position.set(at.x, BELT_TOP + 0.18, at.z);
    });
    return root;
  },
};
