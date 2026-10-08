import type { Meta, StoryObj } from '@storybook/html-vite';
import { Vector3 } from 'three';
import type { SystemKind } from '../primitives/node/emblems';
import { SystemNode } from '../primitives/node/SystemNode';
import { specimenStage } from '../stage/specimen';
import { spawnDrone } from '../stage/spawnDrone';
import { Intake } from './intake';

const meta: Meta = {
  title: 'Story Parts/Intake',
  parameters: { layout: 'fullscreen' },
};
export default meta;

/** Tools to grow the system with, in order, and where each stands: Jira first, in the middle. */
const TOOLS: [SystemKind, number, number][] = [
  ['jira', 0, 0],
  ['confluence', 0, -2.5],
  ['bitbucket', 2.5, 0],
  ['codesearch', 2.5, -2.5],
  ['figma', -2.5, 0],
  ['notion', -2.5, -2.5],
  ['github', 0, 2.5],
];

/**
 * The intake loop (ILI-972), on a seeded run. Clouds drift by (easing in and
 * out) and drop Jira tickets on the open floor just outside the system; one
 * to three of Rovo's sub-agents fly out, pick them up and triage each into
 * Jira (the triage point, a size up) or Confluence. `tools` grows the
 * system (1 to 7): the ring of drops follows its edge. `seed` changes the
 * run. No captions.
 */
export const Loop: StoryObj<{ tools: number; seed: number }> = {
  argTypes: {
    tools: { control: { type: 'range', min: 1, max: TOOLS.length, step: 1 } },
    seed: { control: { type: 'number', min: 1, step: 1 } },
  },
  args: { tools: 4, seed: 7 },
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 13, focusY: 0.6 });
    // Jira, the first tool placed, sits dead center; the system grows out from it.
    stage.centerOn(new Vector3(0, 0.6, 0));
    const nodes = TOOLS.slice(0, args.tools).map(([kind, x, z]) => {
      const node = new SystemNode({ kind });
      node.position.set(x, 0, z);
      stage.add(node);
      return node;
    });
    const { drone: rovo } = spawnDrone(stage, -1.5, 3.5, { name: 'Rovo', lineage: 'cyan', showLabel: true, status: 'waiting' });
    const intake = new Intake(
      stage,
      {
        system: () => nodes,
        jira: nodes[0],
        confluence: nodes.find((n) => n.kind === 'confluence'),
        crewFrom: () => [rovo],
      },
      args.seed,
    );
    intake.start();
    Object.assign(window, { __story: intake });
    return root;
  },
};
