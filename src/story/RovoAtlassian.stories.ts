import type { Meta, StoryObj } from '@storybook/html-vite';
import { specimenStage } from '../stage/specimen';
import { JIRA_AT, ROVO_GATE, RovoAtlassian } from './rovoAtlassian';

const meta: Meta = {
  title: 'Story Narrative/Rovo on the Atlassian Grid',
  parameters: { layout: 'fullscreen' },
};
export default meta;

/**
 * Rovo and Jira, the quarterback. Rovo floats in dead center on its gate and
 * authenticates (yellow, then green), then moves into Jira and works from
 * there: Jira is the system of record. Tasks keep coming onto Jira's board;
 * one to three sub-agents spawn out of Rovo, each takes a task, flies to an
 * open spot and spins up its own tools for it (Bitbucket or GitHub,
 * Confluence or Google Docs, sometimes Figma or Code search), tied back to
 * Jira. The work rides the tie home, the task comes back done, the tools fold
 * away. Seeded: `seed` changes the run. No captions.
 */
export const Working: StoryObj<{ seed: number }> = {
  argTypes: { seed: { control: { type: 'number', min: 1, step: 1 } } },
  args: { seed: 3 },
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 18, focusY: 0.6 });
    // Framed halfway between the gate, where Rovo starts, and Jira, where it works: both sit near the middle.
    stage.centerOn(ROVO_GATE.clone().lerp(JIRA_AT, 0.5).setY(0.6));
    const scene = new RovoAtlassian(stage, args.seed);
    void scene.start();
    Object.assign(window, { __story: scene });
    return root;
  },
};
