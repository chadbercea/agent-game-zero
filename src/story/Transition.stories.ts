import type { Meta, StoryObj } from '@storybook/html-vite';
import { specimenStage } from '../stage/specimen';
import { dismiss } from './fanOut';
import { HOME, STORY_CENTER } from './layout';
import { leaveBase } from './leaveBase';
import { wait } from './timeline';
import { act1, toAtlassian, twoActScene } from './twoActs';

const meta: Meta = {
  title: 'Story/08 Act Transition',
  parameters: { layout: 'fullscreen' },
};
export default meta;

/**
 * Act 1 plays as before, but the crew stays working, all green. D3V1N then
 * mutes its link (dots clear before it moves), leaves the first gate open and
 * green, flies across the grid to the Atlassian gate, and authenticates.
 */
export const Transition: StoryObj = {
  render: () => {
    const { root, stage } = specimenStage({ viewSize: 18.5, focusY: 0 });
    stage.centerOn(STORY_CENTER);
    const scene = twoActScene(stage);
    void (async () => {
      for (;;) {
        await wait(stage, 1);
        const working = await act1(stage, scene);
        if (!working) continue;
        await toAtlassian(stage, scene);
        await wait(stage, 6);
        // Reset for the replay.
        working.stop();
        dismiss(working.crew);
        scene.act1.map.hide();
        scene.act1.gate.state = 'off';
        await leaveBase(stage, { drone: scene.drone, ...scene.act2 }, HOME);
      }
    })();
    return root;
  },
};
