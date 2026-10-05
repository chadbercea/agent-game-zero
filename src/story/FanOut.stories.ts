import type { Meta, StoryObj } from '@storybook/html-vite';
import { attachSignal } from '../stage/attachSignal';
import { Vector3 } from 'three';
import { DroneFlight } from '../animation/DroneFlight';
import { GateAnimator } from '../animation/GateAnimator';
import { Gate } from '../primitives/gate/Gate';
import { SYSTEM_KINDS } from '../primitives/node/emblems';
import { FACE_CAMERA, spawnDrone } from '../stage/spawnDrone';
import { specimenStage } from '../stage/specimen';
import { accessCheck } from './accessCheck';
import { dismiss, fanOut, work } from './fanOut';
import { hoverLines } from './hoverLines';
import { revealMap } from './revealMap';
import { SystemMap } from './SystemMap';
import { fly, wait } from './timeline';

const meta: Meta = {
  title: 'Story/05 Fan-out and Work',
  parameters: { layout: 'fullscreen' },
};
export default meta;

/**
 * Access → map → fan-out → work. D3V1N turns green, its signal link to the
 * gate in conversation, while it orchestrates. It spawns one sub-agent per system;
 * each rides its branch out, floats over its node and does that system's job
 * (report, branch + git init, read). Nodes light with their sub-agent's status.
 */
export const FanOut: StoryObj = {
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
    attachSignal(stage, drone, gate);
    void (async () => {
      for (;;) {
        await wait(stage, 1);
        if (!(await accessCheck(stage, drone, gate))) continue;
        await revealMap(stage, map);
        drone.status = 'working';
        const crew = await fanOut(stage, drone, map);
        await work(stage, crew);
        await wait(stage, 3);
        dismiss(crew);
        drone.status = 'waiting';
        map.hide();
        gate.state = 'off';
        drone.status = 'working';
        await fly(stage, DroneFlight.to(drone, home));
        drone.status = 'waiting';
      }
    })();
    return root;
  },
};
