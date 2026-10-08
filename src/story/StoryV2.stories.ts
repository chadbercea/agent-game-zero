import type { Meta, StoryObj } from '@storybook/html-vite';
import { specimenStage } from '../stage/specimen';
import { ACT1_GATE, HOME, STORY_CENTER } from './layout';
import { StoryV2, type V2Beat } from './storyV2';
import { wait } from './timeline';

const meta: Meta = {
  title: 'Story',
  parameters: { layout: 'fullscreen' },
};
export default meta;

/** Play the v2 story through `beat`, hold, clear, and go again. */
function loop(through: V2Beat, hold: number, view: { viewSize: number; focusY: number; center: 'ticket' | 'gate' | 'story' }) {
  const { root, stage } = specimenStage({ viewSize: view.viewSize, focusY: view.focusY });
  // The opening frames the gate, where the ticket lands, and D3V1N's home, where it floats in to.
  const focus = { ticket: ACT1_GATE.clone().lerp(HOME, 0.5), gate: ACT1_GATE, story: STORY_CENTER }[view.center];
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
 * (DEMO-1) at D3V1N's gate, before the gate is up; the cloud drifts on, and
 * D3V1N floats in and notices it. No captions.
 */
export const Opening: StoryObj = {
  name: '01 Opening',
  render: () => loop('opening', 3, { viewSize: 9, focusY: 1.2, center: 'ticket' }),
};

/**
 * Beats 1 and 2, on loop. D3V1N takes the ticket and calls its gate, which
 * pops up out of the floor; it flies there and gets access (yellow, then
 * green). It calls GitHub, and only GitHub comes up: its trace draws over
 * the faint grid, the tool rises, and the line fades off. One sub-agent
 * rides the trace to GitHub and starts a branch. No captions.
 */
export const OwnSystem: StoryObj = {
  name: '02 Own System',
  render: () => loop('own-system', 12, { viewSize: 12, focusY: 0.8, center: 'gate' }),
};

/**
 * Beats 1 to 3, on loop. Rovo arrives on its own, calls its gate, gets
 * access, and calls Jira, which comes up on its own. One of its sub-agents
 * builds the secure bridge between the systems (the glass tunnel, the lock)
 * and dissolves back into Rovo. The graph's lines draw in between GitHub and
 * Jira, through the tunnel's ends, and data streams through it: the super tunnel. Power comes through
 * to D3V1N, and it charges up. No captions.
 */
export const RovoBridge: StoryObj = {
  name: '03 Rovo Builds the Bridge',
  render: () => loop('rovo-bridge', 6, { viewSize: 15, focusY: 0, center: 'story' }),
};

/**
 * Beats 1 to 4, on loop. Juiced, D3V1N runs three sub-agents: its first
 * stays on GitHub, D3V1N calls Bitbucket up, and two ride the graph through the super tunnel, then fly straight to it: the first works Bitbucket, the second a tertiary node that buds off it and feeds into it.
 * All three build branches fast, and commits keep landing in GitHub. No
 * captions.
 */
export const JuicedCrew: StoryObj = {
  name: '04 Juiced Crew',
  render: () => loop('juiced-crew', 10, { viewSize: 15, focusY: 0, center: 'story' }),
};

/**
 * Beats 1 to 5, on loop. An output line draws from GitHub to an assembler,
 * and a belt and a portal appear. Every commit landing in GitHub sends a
 * little block down the line; eight fuse into a bigger block, which rides
 * the belt through the portal. No captions.
 */
export const ShipOutput: StoryObj = {
  name: '05 Ship Output',
  render: () => loop('ship-output', 12, { viewSize: 15, focusY: 0, center: 'story' }),
};

/**
 * The whole play, on loop. D3V1N's crew spreads across both systems, calling
 * up each tool it heads for (Notion, Figma, Code search, Confluence), Rovo's
 * helpers come and go on its tools, products keep flowing to GitHub and out
 * the portal, and the camera pulls back to take it all in. No captions.
 */
export const FullSystem: StoryObj = {
  name: '06 Full System',
  render: () => loop('full-system', 20, { viewSize: 15, focusY: 0, center: 'story' }),
};
