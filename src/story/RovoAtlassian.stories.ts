import type { Meta, StoryObj } from '@storybook/html-vite';
import { specimenStage } from '../stage/specimen';
import { JIRA_AT, ROVO_GATE, RovoAtlassian } from './rovoAtlassian';

const meta: Meta = {
  title: 'Story Narrative/Rovo on the Atlassian Grid',
  parameters: { layout: 'fullscreen' },
};
export default meta;

/**
 * Rovo and Jira, the quarterback (docs/rovo-mental-model.md). Rovo flies to
 * its gate and authenticates (yellow, then green); the line draws to Jira and
 * Jira comes up; Rovo moves in (the gate locks behind it) and works from
 * there. Tasks keep coming onto Jira's board; for each, Rovo sends a copy of
 * itself (one to three at once) that runs the task's steps: it flies to each
 * system the step needs (a line draws out from Jira, then the system appears),
 * works it while hovering over it, and reports to Jira. Code is squash-merged
 * into the run's repo, whose trunk keeps every commit. Teamwork Graph apps
 * stay; third-party tools go when their task is done. Seeded: `seed` changes
 * the run. No captions.
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
