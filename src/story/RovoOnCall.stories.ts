import type { Meta, StoryObj } from '@storybook/html-vite';
import { specimenStage } from '../stage/specimen';
import { Inspector } from '../stage/Inspector';
import { FamilyTree } from './familyTree';
import { onCallInspectables } from './onCallInspect';
import { ON_CALL_BEATS, type OnCallBeat, RovoOnCall } from './rovoOnCall';

const meta: Meta = {
  title: 'Story Narrative/Rovo on Call',
  parameters: { layout: 'fullscreen' },
};
export default meta;

/**
 * Production pages, and Rovo runs the incident from page to postmortem
 * (docs/rovo-mental-model.md). Production comes up past the portal; a
 * service goes red and what depends on it yellow; JSM takes the alert and a
 * red card lands on Jira's board. Rovo takes command at JSM; a copy runs the
 * comms (Slack, the human paged, Statuspage); copies triage; one fixes it
 * (rollback, hotfix, failover, scale-out or a flag off); a terminal watches
 * the logs while the lights go green; the incident closes, the postmortem
 * goes into Confluence, follow-ups land in To do, and everyone goes home.
 * Every seed is a different incident on a different map. No captions. Hover
 * anything to highlight it; click it for its details. `beat` opens the
 * story at that beat: the run up to it plays out at once.
 */
export const OnCall: StoryObj<{ seed: number; beat: OnCallBeat }> = {
  name: 'Page to postmortem',
  argTypes: {
    seed: { control: { type: 'number', min: 1, step: 1 } },
    beat: { control: 'select', options: ON_CALL_BEATS },
  },
  args: { seed: 2, beat: 'arriving' },
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 19, focusY: 0.6 });
    const scene = new RovoOnCall(stage, args.seed);
    stage.frame(scene.map.center, scene.map.viewSize);
    void scene.start();
    if (args.beat !== ON_CALL_BEATS[0]) void stage.skip({ until: () => scene.beat === args.beat });
    const inspector = new Inspector(stage, onCallInspectables(scene), root);
    const family = new FamilyTree(stage, scene.rovo.drone, () => [...scene.copies.keys()]);
    stage.onTick(() => family.focus(inspector.selected?.kind === 'agent' || inspector.selected?.kind === 'sub-agent'));
    Object.assign(window, { __story: scene, __inspector: inspector, __family: family });
    return root;
  },
};
