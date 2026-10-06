import type { Meta, StoryObj } from '@storybook/html-vite';
import { specimenStage } from '../stage/specimen';
import { STORY_CENTER } from './layout';
import { wait } from './timeline';
import { Trickle } from './trickle';
import { twoActScene } from './twoActs';
import { D3V1N_ID, Volume } from './volume';

const meta: Meta = {
  title: 'Story/12 Trickle',
  parameters: { layout: 'fullscreen' },
};
export default meta;

/**
 * Requests trickling in: both systems open, and every new request the ledger
 * takes in drops onto its system's gate as a small ticket and rides out to
 * its node. Volume runs in the background only (no agents working), so this
 * is the quiet rate; agents at work bring more.
 */
export const BothSystems: StoryObj = {
  render: () => {
    const { root, stage } = specimenStage({ viewSize: 17, focusY: 0 });
    stage.centerOn(STORY_CENTER);
    const scene = twoActScene(stage);
    for (const system of [scene.act1, scene.act2]) {
      system.gate.state = 'open';
      system.map.showAll();
    }
    const trickle = new Trickle(stage, [scene.act1, scene.act2]);
    const volume = new Volume(stage, scene, () => [{ id: D3V1N_ID, drone: scene.drone }]);
    volume.onArrive((id) => trickle.land(id));
    return root;
  },
};

/** One system opens and closes: the trickle starts when its gate turns green and stops when it's off. */
export const OpenAndClose: StoryObj = {
  render: () => {
    const { root, stage } = specimenStage({ viewSize: 17, focusY: 0 });
    stage.centerOn(STORY_CENTER);
    const scene = twoActScene(stage);
    scene.act1.map.showAll();
    const trickle = new Trickle(stage, [scene.act1]);
    const volume = new Volume(stage, scene, () => []);
    volume.onArrive((id) => trickle.land(id));
    void (async () => {
      for (;;) {
        scene.act1.gate.state = 'open';
        await wait(stage, 10);
        scene.act1.gate.state = 'off';
        await wait(stage, 4);
      }
    })();
    return root;
  },
};
