import type { Meta, StoryObj } from '@storybook/html-vite';
import { STORY_CENTER } from './layout';
import { specimenStage } from '../stage/specimen';
import { wait } from './timeline';
import { twoActScene, teamworkGraph } from './twoActs';

const meta: Meta = {
  title: 'Story/09 Teamwork Graph',
  parameters: { layout: 'fullscreen' },
};
export default meta;

/**
 * Both systems on the grid, and the Teamwork Graph drawing in across them:
 * lines of blue dots marching along the same floor plane, linking every
 * system by the shortest wiring. Loops: draw in, hold, fade.
 */
export const Web: StoryObj = {
  render: () => {
    const { root, stage } = specimenStage({ viewSize: 18.5, focusY: 0 });
    stage.centerOn(STORY_CENTER);
    const scene = twoActScene(stage);
    scene.act1.gate.state = scene.act2.gate.state = 'open';
    scene.act1.map.showAll();
    scene.act2.map.showAll();
    const graph = teamworkGraph(stage, scene);
    void (async () => {
      for (;;) {
        await wait(stage, 0.8);
        await graph.reveal(stage);
        await wait(stage, 4);
        await graph.fade(stage);
      }
    })();
    return root;
  },
};
