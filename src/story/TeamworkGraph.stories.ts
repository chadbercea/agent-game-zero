import type { Meta, StoryObj } from '@storybook/html-vite';
import { STORY_CENTER } from './layout';
import { specimenStage } from '../stage/specimen';
import { TeamworkGraph } from './TeamworkGraph';
import { wait } from './timeline';
import { twoActScene } from './twoActs';

const meta: Meta = {
  title: 'Story/09 Teamwork Graph',
  parameters: { layout: 'fullscreen' },
};
export default meta;

/**
 * Both systems on the grid, and the Teamwork Graph drawing in across them:
 * solid ribbons on the same floor plane, linking the Atlassian tools to each
 * other and to Figma, GitHub and Notion. Loops: draw in, hold, fade.
 */
export const Web: StoryObj = {
  render: () => {
    const { root, stage } = specimenStage({ viewSize: 18.5, focusY: 0 });
    stage.centerOn(STORY_CENTER);
    const scene = twoActScene(stage);
    scene.act1.gate.state = scene.act2.gate.state = 'open';
    scene.act1.map.showAll();
    scene.act2.map.showAll();
    const graph = new TeamworkGraph(stage, [scene.act1.map.nodes, scene.act2.map.nodes], [scene.act1.gate.position, scene.act2.gate.position]);
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
