import type { Meta, StoryObj } from '@storybook/html-vite';
import { DroneFlight } from '../animation/DroneFlight';
import { SUB_AGENT_SCALE } from '../primitives/drone/Drone';
import { SYSTEM_KINDS, type SystemKind } from '../primitives/node/emblems';
import { SystemNode } from '../primitives/node/SystemNode';
import { attachSignal } from '../stage/attachSignal';
import { FACE_CAMERA, spawnDrone } from '../stage/spawnDrone';
import { specimenStage } from '../stage/specimen';
import { type Claim, Tertiaries } from './tertiary';
import { fly, tween, wait } from './timeline';

interface TertiaryArgs {
  /** How many agents work the one tool (the first takes the tool; each one after gets a tertiary node). */
  agents: number;
  kind: SystemKind;
}

const meta: Meta<TertiaryArgs> = {
  title: 'Story Rework v2/Parts/Tertiary Nodes',
  parameters: { layout: 'fullscreen' },
  argTypes: {
    agents: { control: { type: 'range', min: 1, max: 6, step: 1 } },
    kind: { control: 'select', options: SYSTEM_KINDS },
  },
  args: { agents: 3, kind: 'github' },
};
export default meta;

/**
 * Several agents on one tool, on loop. The first agent works the tool itself;
 * each one after it gets a tertiary node of its own, which buds off the
 * tool (smaller, same kind, a short trace back to it) and keeps feeding its
 * work along the trace into the tool. Then the agents finish one by one,
 * newest first, and each tertiary goes away with its agent. Set how many
 * agents with the control: tertiaries = agents − 1. No captions.
 */
export const OnOneTool: StoryObj<TertiaryArgs> = {
  name: 'Agents on One Tool',
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 6, focusY: 0.4 });
    const node = new SystemNode({ kind: args.kind });
    stage.add(node);
    const tertiaries = new Tertiaries(stage, () => [node.position]);
    const from = node.position.clone().set(-3.5, 0, 3.5);
    void (async () => {
      for (;;) {
        // Agents arrive one after another and take their places.
        const crew: { claim: Claim; despawn: () => void; detach: () => void }[] = [];
        for (let i = 0; i < args.agents; i++) {
          const claim = tertiaries.claim(node);
          const sub = spawnDrone(stage, from.x, from.z, { name: `Agent ${i + 1}`, subAgent: true, status: 'working' });
          sub.drone.rotation.y = FACE_CAMERA;
          await Promise.all([
            fly(stage, DroneFlight.to(sub.drone, claim.spot, { speed: 4 })),
            tween(stage, 0.5, (t) => sub.drone.scale.setScalar(SUB_AGENT_SCALE * (0.3 + 0.7 * t))),
          ]);
          const signal = attachSignal(stage, sub.drone, claim.tertiary ?? node);
          if (!claim.tertiary) node.light = 'working';
          crew.push({ claim, despawn: sub.despawn, detach: signal.detach });
          await wait(stage, 0.5);
        }
        await wait(stage, 5);
        // Work ends, newest first: each tertiary goes with its agent.
        for (const member of crew.reverse()) {
          member.detach();
          member.claim.release();
          member.despawn();
          await wait(stage, 0.7);
        }
        node.light = 'off';
        await wait(stage, 1.5);
      }
    })();
    return root;
  },
};
