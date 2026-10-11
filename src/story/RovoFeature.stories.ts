import type { Meta, StoryObj } from '@storybook/html-vite';
import { specimenStage } from '../stage/specimen';
import { Inspector } from '../stage/Inspector';
import { FamilyTree } from './familyTree';
import { STORY_CENTER } from './rovoAtlassian';
import { RovoFeature } from './rovoFeature';
import { rovoInspectables } from './rovoInspect';

const meta: Meta = {
  title: 'Story Narrative/Rovo ships a feature',
  parameters: { layout: 'fullscreen' },
};
export default meta;

/**
 * One request from the user, followed all the way to production, built from
 * the same pieces as Rovo on the Atlassian Grid (docs/rovo-mental-model.md).
 * Rovo comes in and gets into Jira; the user's terminal asks; a copy writes
 * the spec (Confluence, Figma through MCP, back to Confluence, back to the
 * user); Rovo breaks it into four code tickets and three coders build them in
 * their own lanes, merging and deploying; two releases ride the belt through
 * the portal; a copy announces it in Slack while another writes the release
 * notes and tells the user; then everyone goes home into Rovo and Jira goes
 * quiet. It ends there. No captions. Hover anything to highlight it; click it
 * for its details. Click Rovo or a copy for the drone family tree.
 */
export const Feature: StoryObj<{ seed: number }> = {
  name: 'Request to production',
  argTypes: { seed: { control: { type: 'number', min: 1, step: 1 } } },
  args: { seed: 4 },
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 19, focusY: 0.6 });
    stage.centerOn(STORY_CENTER);
    const scene = new RovoFeature(stage, args.seed);
    void scene.start();
    const inspector = new Inspector(stage, rovoInspectables(scene), root);
    const family = new FamilyTree(stage, scene.rovo.drone, () => [...scene.copies.keys()]);
    stage.onTick(() => family.focus(inspector.selected?.kind === 'agent' || inspector.selected?.kind === 'sub-agent'));
    Object.assign(window, { __story: scene, __inspector: inspector, __family: family });
    return root;
  },
};
