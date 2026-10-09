import type { Meta, StoryObj } from '@storybook/html-vite';
import { specimenStage } from '../stage/specimen';
import { ROVO_GATE, RovoAtlassian } from './rovoAtlassian';

const meta: Meta = {
  title: 'Story Narrative/Rovo on the Atlassian Grid',
  parameters: { layout: 'fullscreen' },
};
export default meta;

/**
 * Rovo working its Atlassian grid. Rovo floats in dead center, on its gate,
 * and gets access (yellow, then green). Then it keeps its system busy: tools
 * come up as it calls them (Jira, Confluence, Bitbucket, Code search, laid
 * out by the grid guide, their lines and grid drawing in and fading); one to
 * three sub-agents at a time fly straight out, each works a tertiary of its
 * own off its tool, and the tool's product rides its line back to Rovo.
 * Seeded: `seed` changes the run. No captions.
 */
export const Working: StoryObj<{ seed: number }> = {
  argTypes: { seed: { control: { type: 'number', min: 1, step: 1 } } },
  args: { seed: 3 },
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 13, focusY: 0.6 });
    stage.centerOn(ROVO_GATE.clone().setY(0.6));
    const scene = new RovoAtlassian(stage, args.seed);
    void scene.start();
    Object.assign(window, { __story: scene });
    return root;
  },
};
