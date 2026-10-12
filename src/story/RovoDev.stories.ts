import type { Meta, StoryObj } from '@storybook/html-vite';
import { specimenStage } from '../stage/specimen';
import { Inspector } from '../stage/Inspector';
import { FamilyTree } from './familyTree';
import { DEV_BEATS, type DevBeat, RovoDev } from './rovoDev';
import { rovoInspectables } from './rovoInspect';

const meta: Meta = {
  title: 'Story Narrative/Rovo Dev',
  parameters: { layout: 'fullscreen' },
};
export default meta;

/**
 * A developer's day, told as the developer's jobs to be done, built from the
 * same pieces as the other stories (docs/rovo-mental-model.md). The day
 * starts in the developer's terminal, and Rovo is started from it; Rovo goes
 * through its gate into Jira, the terminal ties in and asks what's on the
 * plate; clouds (the team) float over the board and drop the day's issues. Understand:
 * a copy per issue reads what it needs (Code search for a bug, Confluence and
 * Figma for a feature, the repo for a chore) and tells the developer. Write
 * the change: each copy codes its issue in its own lane. Get it reviewed: a
 * reviewing copy reads each diff at its lane's terminal, sometimes sending it
 * back once. Get it green and shipped: CI (red once, sometimes), merge, a
 * release each through the portal. Keep the docs current: release notes in
 * Confluence and back to the developer, sometimes a post in Slack. Then
 * everyone goes home into Rovo. No captions. Hover anything to highlight it;
 * click it for its details. Click Rovo or a copy for the drone family tree.
 * `seed` rolls the day (`rollDevDay`); `beat` opens the story at that beat.
 */
export const DevDay: StoryObj<{ seed: number; beat: DevBeat }> = {
  name: "A developer's day",
  argTypes: {
    seed: { control: { type: 'number', min: 1, step: 1 } },
    beat: { control: 'select', options: DEV_BEATS },
  },
  args: { seed: 5, beat: 'terminal' },
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 19, focusY: 0.6 });
    const scene = new RovoDev(stage, args.seed);
    // Framed on this seed's map: everything on it, whichever way it's laid out.
    stage.frame(scene.map.center, scene.map.viewSize);
    void scene.start();
    if (args.beat !== DEV_BEATS[0]) void stage.skip({ until: () => scene.beat === args.beat });
    const inspector = new Inspector(stage, rovoInspectables(scene), root);
    const family = new FamilyTree(stage, scene.rovo.drone, () => [...scene.copies.keys()]);
    stage.onTick(() => family.focus(inspector.selected?.kind === 'agent' || inspector.selected?.kind === 'sub-agent'));
    Object.assign(window, { __story: scene, __inspector: inspector, __family: family });
    return root;
  },
};
