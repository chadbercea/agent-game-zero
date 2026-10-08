import type { Meta, StoryObj } from '@storybook/html-vite';
import { specimenStage } from '../stage/specimen';
import { STORY_CENTER } from './layout';
import { TwoSystemsStory } from './twoSystemsStory';
import { wait } from './timeline';

const meta: Meta = {
  title: 'Story/Two Systems Story',
  parameters: { layout: 'fullscreen' },
};
export default meta;

/** Framed as Story Parts / Two Systems / Layout: the same center and view size. */
const VIEW = { viewSize: 18.5, focusY: 0 };

/**
 * Version A on loop (ILI-979): D3V1N's own system, one gate, its tools laid
 * out behind it by the grid guide. ILI-990 lands at D3V1N; it gets access at
 * its gate (yellow, then green). Linear comes up and the ticket goes to live
 * there; a sub-agent reads it, and the issue rides the line back. Then Notion
 * and the PRD, then Figma and the design, the same way. D3V1N plans. GitHub
 * comes up: a sub-agent branches, commits and opens the PR. Last, a
 * sub-agent goes back to Linear and updates ILI-990 by hand. No captions.
 */
export const VersionA: StoryObj = {
  name: 'Version A',
  render: () => {
    const { root, stage } = specimenStage(VIEW);
    stage.centerOn(STORY_CENTER);
    const story = new TwoSystemsStory(stage);
    Object.assign(window, { __story: story });
    void (async () => {
      for (;;) {
        await wait(stage, 0.8);
        await story.play();
        await wait(stage, 3);
        await story.reset();
      }
    })();
    return root;
  },
};
