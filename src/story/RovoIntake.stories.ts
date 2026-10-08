import type { Meta, StoryObj } from '@storybook/html-vite';
import { specimenStage } from '../stage/specimen';
import { ROVO_AT, RovoIntake } from './rovoIntake';

const meta: Meta = {
  title: 'Story Narrative/Rovo Intake',
  parameters: { layout: 'fullscreen' },
};
export default meta;

/**
 * A white blank space with Rovo in the center. Clouds pass by and drop Jira
 * issues (cards) outside a general perimeter around it; Rovo's sub-agents fly
 * straight out, get them, and triage each one onto one of three piles in
 * front of Rovo. Runs continuously on a seeded RNG: `seed` changes when
 * clouds come, where cards land, which pile, and how many sub-agents Rovo
 * runs at once (one to three). No captions.
 */
export const Intake: StoryObj<{ seed: number }> = {
  argTypes: { seed: { control: { type: 'number', min: 1, step: 1 } } },
  args: { seed: 7 },
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 14, focusY: 0.6 });
    stage.centerOn(ROVO_AT.clone().setY(0.6));
    const intake = new RovoIntake(stage, args.seed);
    intake.start();
    Object.assign(window, { __story: intake });
    return root;
  },
};
