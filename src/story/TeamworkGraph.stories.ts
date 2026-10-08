import type { Meta, StoryObj } from '@storybook/html-vite';
import { Gateway } from '../primitives/gateway/Gateway';
import { GATEWAY, STORY_CENTER } from './layout';
import { specimenStage } from '../stage/specimen';
import { tween, wait } from './timeline';
import { twoActScene, teamworkGraph } from './twoActs';

const meta: Meta = {
  title: 'Story Parts/Teamwork Graph',
  parameters: { layout: 'fullscreen' },
};
export default meta;

/**
 * Both systems on the grid, and the Teamwork Graph drawing in across them:
 * lines of blue dots marching along the same floor plane, linking every
 * system. Cross-system links feed into the secure gateway's two ends; once
 * the lines connect, data streams through the tunnel, and when they fade,
 * the streams stop with them. Loops: draw in, stream, hold, fade.
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
    const gateway = new Gateway(GATEWAY);
    gateway.dropFrom.copy(gateway.center).setY(0.6);
    gateway.built = gateway.lockDrop = 1;
    stage.add(gateway);
    stage.onTick((dt) => gateway.update(dt));
    graph.feed(gateway.conduit);
    void (async () => {
      for (;;) {
        await wait(stage, 0.8);
        await graph.reveal(stage);
        await tween(stage, 1, (t) => (gateway.conduit.streams = t));
        await wait(stage, 4);
        await graph.fade(stage);
      }
    })();
    return root;
  },
};
