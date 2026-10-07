import type { Meta, StoryObj } from '@storybook/html-vite';
import { specimenStage } from '../stage/specimen';
import { REWORK } from './rework';
import { type ReworkBeat, ReworkStory } from './reworkStory';
import { wait } from './timeline';

const meta: Meta = {
  title: 'Story Rework',
  parameters: { layout: 'fullscreen' },
};
export default meta;

/** Play the reworked story through `beat`, hold, clear, and go again. */
function loop(through: ReworkBeat, hold: number, view: { viewSize: number; focusY: number; center: 'ticket' | 'grid' }) {
  const { root, stage } = specimenStage({ viewSize: view.viewSize, focusY: view.focusY });
  stage.centerOn((view.center === 'ticket' ? REWORK.ticketSpot : REWORK.center).clone().setY(view.focusY));
  const story = new ReworkStory(stage);
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
 * Beat 1, on loop: a cloud materializes over the grid, a hand reaches down
 * and hands over a Jira ticket (DEMO-1), waves, and pulls back up; the cloud
 * pops away; D3V1N floats in to the ticket and notices it. No captions.
 */
export const Opening: StoryObj = {
  name: '01 Opening',
  render: () => loop('opening', 3, { viewSize: 8, focusY: 1.4, center: 'ticket' }),
};

/**
 * Beats 1 and 2, on loop. After the opening, D3V1N works within its reach:
 * its access lines draw out to Jira and GitHub (the other tools show only as
 * faint ghosts, out of reach); the ticket goes into Jira and D3V1N reads it
 * there; then it rides its lines to GitHub, starts a branch, and keeps
 * working. No captions.
 */
export const WithinReach: StoryObj = {
  name: '02 Within Reach',
  render: () => loop('within-reach', 6, { viewSize: 13, focusY: 0.8, center: 'grid' }),
};

/**
 * Beats 1 to 3, on loop. While D3V1N works at GitHub, it phones Rovo: a
 * handset rides its lines to Jira, rings, and goes out. Rovo flies in to
 * Jira and fires up the rest of the Teamwork Graph (a wave brings every
 * ghost tool online; the graph's links draw in), then secures D3V1N's way
 * in: the glass gateway over its line to Jira, and the lock. Power comes
 * through to D3V1N, and it charges up. No captions.
 */
export const PhonesRovo: StoryObj = {
  name: '03 Phones Rovo',
  render: () => loop('phones-rovo', 6, { viewSize: 13, focusY: 0.8, center: 'grid' }),
};

/**
 * Beats 1 to 4, on loop. Juiced, D3V1N steps back to its spot and buds
 * three sub-agents: two work side by side over GitHub, one goes through the
 * gateway to Bitbucket. All three build branches fast, and commits keep
 * flowing into GitHub (Bitbucket's along the graph). No captions.
 */
export const JuicedCrew: StoryObj = {
  name: '04 Juiced Crew',
  render: () => loop('juiced-crew', 10, { viewSize: 13, focusY: 0.8, center: 'grid' }),
};

