import type { Meta, StoryObj } from '@storybook/html-vite';
import { specimenStage } from '../stage/specimen';
import { RovoAtlassian, STORY_CENTER } from './rovoAtlassian';

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
 * into the run's repo from its lane (worktree → terminal → repo: written,
 * checked in, CI passes, merged, deployed down the belt into the portal), and
 * the repo's trunk keeps every commit. Teamwork Graph apps
 * stay; third-party tools go when their task is done. Seeded: `seed` changes
 * the run. No captions.
 */
export const Working: StoryObj<{ seed: number }> = {
  argTypes: { seed: { control: { type: 'number', min: 1, step: 1 } } },
  args: { seed: 3 },
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 19, focusY: 0.6 });
    // Framed on the whole grid: the mini systems around Jira on the left, the code side out to the portal on the right.
    stage.centerOn(STORY_CENTER);
    const scene = new RovoAtlassian(stage, args.seed);
    void scene.start();
    Object.assign(window, { __story: scene });
    return root;
  },
};
