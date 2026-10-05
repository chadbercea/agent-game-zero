import type { Meta, StoryObj } from '@storybook/html-vite';
import { Vector3 } from 'three';
import { DroneFlight } from '../animation/DroneFlight';
import { GateAnimator } from '../animation/GateAnimator';
import { Gate } from '../primitives/gate/Gate';
import { SYSTEM_KINDS } from '../primitives/node/emblems';
import { FACE_CAMERA, spawnDrone } from '../stage/spawnDrone';
import { specimenStage } from '../stage/specimen';
import { hoverLines } from './hoverLines';
import { runJob } from './runJob';
import { SystemMap } from './SystemMap';
import { fly, wait } from './timeline';

const meta: Meta = {
  title: 'Story/06 Return',
  parameters: { layout: 'fullscreen' },
};
export default meta;

/**
 * The whole job: access → map → fan-out → work (progress packets stream back
 * to D3V1N) → each sub-agent, as its job finishes, carries its work product
 * home along its branch, docks into D3V1N and despawns.
 */
export const Return: StoryObj = {
  render: () => {
    const { root, stage } = specimenStage({ viewSize: 13, focusY: 0 });
    const gate = new Gate();
    gate.position.set(2, 0, 2);
    gate.rotation.y = FACE_CAMERA;
    const gateAnimator = new GateAnimator(gate);
    stage.add(gate);
    stage.onTick((dt) => gateAnimator.update(dt));
    const map = new SystemMap(stage, gate, SYSTEM_KINDS);
    hoverLines(stage, map);

    const home = new Vector3(-1.8, 0, 5);
    const { drone } = spawnDrone(stage, home.x, home.z, { name: 'D3V1N', showLabel: true, status: 'waiting' });
    void (async () => {
      for (;;) {
        await wait(stage, 1);
        if (!(await runJob(stage, { drone, gate, map }))) continue;
        drone.status = 'working';
        await wait(stage, 2);
        map.hide();
        gate.state = 'off';
        await fly(stage, DroneFlight.to(drone, home));
        drone.status = 'waiting';
      }
    })();
    return root;
  },
};
