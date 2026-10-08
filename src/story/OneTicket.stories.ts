import type { Meta, StoryObj } from '@storybook/html-vite';
import { specimenStage } from '../stage/specimen';
import { A_CENTER, OneTicket, type OneTicketBeat } from './oneTicket';
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
