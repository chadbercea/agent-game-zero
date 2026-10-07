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

/** A belt running, with a block riding it end to end on a loop. */
export const Running: StoryObj = {
  render: () => {
    const { root, stage } = specimenStage({ viewSize: 4.5, focusY: 0.3 });
    const belt = new Conveyor(4);
    belt.position.copy(SCREEN_RIGHT).multiplyScalar(-2);
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
