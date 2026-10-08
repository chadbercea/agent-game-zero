import type { Meta, StoryObj } from '@storybook/html-vite';
import { specimenStage } from '../stage/specimen';
import { A_CENTER, OneTicket, type OneTicketBeat } from './oneTicket';
import { B_CENTER, type BBeat, OneTicketB } from './oneTicketB';
import { OneTicketFull } from './oneTicketFull';
import { wait } from './timeline';

const meta: Meta = {
  title: 'Story/One Ticket',
  parameters: { layout: 'fullscreen' },
};
export default meta;

/** The whole Version A layout on screen, from a camera that never moves. */
const VIEW = { viewSize: 15, focusY: 0.6 };

/** Play the one-ticket story through `beat` (from `from`, the beats before it already done), hold, clear, and go again. */
function loop(through: OneTicketBeat, hold: number, from?: OneTicketBeat) {
  const { root, stage } = specimenStage(VIEW);
  stage.centerOn(A_CENTER.clone().setY(VIEW.focusY));
  const story = new OneTicket(stage);
  // Handy from the browser console (and for automated captures), like __stage.
  Object.assign(window, { __story: story });
  void (async () => {
    for (;;) {
      await wait(stage, 0.8);
      await story.play(through, from);
      await wait(stage, hold);
      await story.reset();
    }
  })();
  return root;
}

/**
 * Version A, beats 1 and 2, on loop. ILI-990 ("Add dark mode") lands in
 * Linear and pings D3V1N: it's assigned. D3V1N crosses the Linear gate
 * (yellow, then green), reads the ticket at the node, and the ticket shows
 * its link on to Notion. D3V1N flies home carrying the issue. Notion, Figma
 * and GitHub wait in the row, each behind its own gate. No captions.
 */
export const A12: StoryObj = {
  name: 'A1–2',
  render: () => loop('a2', 3),
};

/**
 * Version A, beats 1 to 4, on loop. After the ticket, D3V1N follows its link
 * to Notion, crosses Notion's own gate and reads the PRD, whose acceptance
 * criteria link on to Figma; it follows that, crosses Figma's own gate and
 * pulls the design. Home between stops, one gate at a time; the stack it
 * carries grows to three: ticket, PRD, design. No captions.
 */
export const A34: StoryObj = {
  name: 'A3–4',
  render: () => loop('a4', 3),
};

/**
 * Version A, beats 5 to 7, on loop, starting with D3V1N home carrying the
 * ticket, the PRD and the design. Its stack merges into one bigger block:
 * the plan. It crosses GitHub's own gate, a branch grows off GitHub and
 * commits land on it, and the pull request opens. Then it goes back through
 * the Linear gate and updates ILI-990 by hand (the ticket glows green). No
 * captions.
 */
export const A57: StoryObj = {
  name: 'A5–7',
  render: () => loop('a7', 4, 'a5'),
};

/**
 * Version A straight through, beats 1 to 7, on loop: about 30 seconds. Four
 * separate gates, crossed one at a time, with D3V1N carrying all the
 * context itself; the record is only what it leaves behind. No captions.
 */
export const VersionA: StoryObj = {
  name: 'Version A',
  render: () => loop('a7', 4),
};

/** Version B's layout on screen, from a camera that never moves. */
const VIEW_B = { viewSize: 12, focusY: 1.4 };

/** Play Version B through `beat` (from `from`, the beats before it already done), hold, clear, and go again. */
function loopB(through: BBeat, hold: number, from?: BBeat) {
  const { root, stage } = specimenStage(VIEW_B);
  stage.centerOn(B_CENTER.clone().setY(VIEW_B.focusY));
  const story = new OneTicketB(stage);
  Object.assign(window, { __story: story });
  void (async () => {
    for (;;) {
      await wait(stage, 0.8);
      await story.play(through, from);
      await wait(stage, hold);
      await story.reset();
    }
  })();
  return root;
}

/**
 * Version B, beats 1 to 3, on loop: the same work with the Atlassian
 * Teamwork Graph. DEMO-990 lands in Jira and pings D3V1N. D3V1N flies
 * through the one secured gateway (it flashes green) and asks Rovo once.
 * Rovo walks the lines that are already there (Jira to Confluence to Figma,
 * and Jira to Code search), and hands back the issue, the PRD, the design,
 * related issues and the code in one delivery: five on D3V1N's stack. No
 * captions.
 */
export const B13: StoryObj = {
  name: 'B1–3',
  render: () => loopB('b3', 3),
};

/**
 * Version B, beats 4 to 6, on loop, starting with D3V1N home carrying all
 * five. They merge into the plan, the same as Version A. D3V1N stays home:
 * its commits go out through the gateway and along the graph, a branch grows
 * off Bitbucket and they land on it, and the PR opens carrying DEMO-990. A
 * Graph Line draws from the PR back to DEMO-990, which picks up the branch,
 * commits and PR on its own. No captions.
 */
export const B46: StoryObj = {
  name: 'B4–6',
  render: () => loopB('b6', 4, 'b4'),
};

/**
 * Version B straight through, beats 1 to 6, on loop: about 15 seconds. One
 * gateway instead of four gates, context already connected, and a record
 * that keeps itself. No captions.
 */
export const VersionB: StoryObj = {
  name: 'Version B',
  render: () => loopB('b6', 4),
};

/**
 * The whole story, on loop: Version A, then the scene clears, then Version
 * B. The same work, done two ways; this is what the sandbox plays. No
 * captions.
 */
export const Full: StoryObj = {
  name: 'Full (A then B)',
  render: () => {
    const { root, stage } = specimenStage(VIEW);
    const story = new OneTicketFull(stage, (center) => stage.centerOn(center.clone().setY(VIEW.focusY)));
    Object.assign(window, { __story: story });
    void (async () => {
      for (;;) {
        await wait(stage, 0.8);
        await story.play();
      }
    })();
    return root;
  },
};
