import type { Meta, StoryObj } from '@storybook/html-vite';
import { specimenStage } from '../stage/specimen';
import { ACT1_GATE, D3V1N_REQUEST } from './layout';
import { StoryV2, type V2Beat } from './storyV2';
import { wait } from './timeline';

const meta: Meta = {
  title: 'Story Rework v2',
  parameters: { layout: 'fullscreen' },
};
export default meta;

/** Play the v2 story through `beat`, hold, clear, and go again. */
function loop(through: V2Beat, hold: number, view: { viewSize: number; focusY: number; center: 'ticket' | 'gate' }) {
  const { root, stage } = specimenStage({ viewSize: view.viewSize, focusY: view.focusY });
  const focus = view.center === 'ticket' ? D3V1N_REQUEST : ACT1_GATE;
  stage.centerOn(focus.clone().setY(view.focusY));
  const story = new StoryV2(stage);
  void (async () => {
    for (;;) {
      await wait(stage, 0.6);
      await story.play(through);
      await wait(stage, hold);
      await story.reset();
    }
  })();
  return root;
}

/**
 * Beat 1, on loop: a cloud drifts across the sky and drops a Jira ticket
 * (DEMO-1) in front of D3V1N's home by its gate; the cloud drifts on, and
 * D3V1N floats in and notices it. No captions.
 */
export const Opening: StoryObj = {
  name: '01 Opening',
  render: () => loop('opening', 3, { viewSize: 9, focusY: 1.2, center: 'ticket' }),
};

/**
 * Beats 1 and 2, on loop. D3V1N takes the ticket, flies to its gate and
 * gets access (yellow, then green). Its own system maps out the way it
 * always has: traces draw over the faint grid, Figma, GitHub and Notion
 * rise, and the lines fade off. One sub-agent rides the trace to GitHub
 * and starts a branch. Clouds start drifting by, dropping issues into
 * Notion. No captions.
 */
export const OwnSystem: StoryObj = {
  name: '02 Own System',
  render: () => loop('own-system', 12, { viewSize: 12, focusY: 0.8, center: 'gate' }),
};
