import type { Meta, StoryObj } from '@storybook/html-vite';
import { Matrix4, QuadraticBezierCurve3, Vector3 } from 'three';
import { DroneFlight } from '../../animation/DroneFlight';
import { GateAnimator } from '../../animation/GateAnimator';
import { LINEAGES, type Lineage, STATUSES, type Status } from '../../core/palette';
import { Connection } from '../connection/Connection';
import { Gate } from '../gate/Gate';
import { rowPosition, specimenStage } from '../../stage/specimen';
import { spawnDrone } from '../../stage/spawnDrone';

interface DroneArgs {
  status: Status;
  lineage: Lineage;
  subAgent: boolean;
  showLabel: boolean;
  name: string;
}

const meta: Meta<DroneArgs> = {
  title: 'Primitives/Drone',
  parameters: { layout: 'fullscreen' },
  argTypes: {
    status: { control: 'inline-radio', options: STATUSES },
    lineage: { control: 'select', options: LINEAGES },
  },
  args: { status: 'working', lineage: 'blue', subAgent: false, showLabel: true, name: 'D3V1N' },
};
export default meta;

type Story = StoryObj<DroneArgs>;

/**
 * One drone, close up. Every option is a control (`name`, `lineage`,
 * `status`, `subAgent`, `showLabel`), plus `fade` (0–1: materials fade
 * together) and `flashEvery`, which sets `flash` to 1 on a timer (0 =
 * never): the acknowledgement lift.
 */
export const Specimen: StoryObj<DroneArgs & { fade: number; flashEvery: number }> = {
  argTypes: { fade: { control: { type: 'range', min: 0, max: 1, step: 0.01 } }, flashEvery: { control: { type: 'range', min: 0, max: 5, step: 0.5 } } },
  args: { fade: 1, flashEvery: 2 },
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 4.2, focusY: 2.1 });
    const { drone } = spawnDrone(stage, 0, 0, args);
    drone.fade = args.fade;
    let since = 0;
    stage.onTick((dt) => {
      if (!args.flashEvery) return;
      since += dt;
      if (since < args.flashEvery) return;
      since = 0;
      drone.flash = 1;
    });
    return root;
  },
};

/** The drone slowly turning, to judge the body's form from every side. */
export const Turntable: Story = {
  args: { showLabel: false },
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 4.2, focusY: 2.1 });
    const { drone } = spawnDrone(stage, 0, 0, args);
    stage.onTick((dt) => (drone.rotation.y += dt * 0.6));
    return root;
  },
};

/** Problem / Stopped · Idle / Waiting · Working, side by side as in the reference. */
export const StatusTrio: Story = {
  args: { showLabel: false },
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 5.5, focusY: 2.0 });
    STATUSES.forEach((status, i) => {
      const { x, z } = rowPosition(i, STATUSES.length, 3.4);
      spawnDrone(stage, x, z, { ...args, status, name: status });
    });
    return root;
  },
};

/** Lineage palette on the shared body. Status stays on the lens; lineage on the feet. */
export const Lineages: Story = {
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 6, focusY: 2.0 });
    LINEAGES.forEach((lineage, i) => {
      const { x, z } = rowPosition(i, LINEAGES.length, 2.9);
      spawnDrone(stage, x, z, { ...args, lineage, name: lineage });
    });
    return root;
  },
};

/** A parent and its sub-agents: same lineage, smaller body. */
export const ParentAndSubAgents: Story = {
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 7, focusY: 1.4 });
    spawnDrone(stage, 0, 0, args);
    const subs: { x: number; z: number; status: Status }[] = [
      { x: 2.4, z: -1.4, status: 'working' },
      { x: 2.2, z: 1.8, status: 'waiting' },
      { x: -1.6, z: 2.4, status: 'stopped' },
    ];
    subs.forEach(({ x, z, status }, i) =>
      spawnDrone(stage, x, z, { ...args, status, subAgent: true, name: `${args.name}.${i + 1}` }),
    );
    return root;
  },
};

/**
 * Flight: hop to a gate, ride a curved branch line to the next, hop home.
 * The drone leans into travel but keeps facing the camera; it works while
 * moving and waits while parked.
 */
export const Flight: Story = {
  args: { showLabel: false },
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 9, focusY: 0.8 });
    const spots = [new Vector3(-3.2, 0, 1.6), new Vector3(0.6, 0, -2.6), new Vector3(3.6, 0, 1.8)];
    for (const spot of spots) {
      const gate = new Gate({ state: 'open' });
      gate.position.copy(spot);
      const animator = new GateAnimator(gate);
      stage.add(gate);
      stage.onTick((dt) => animator.update(dt));
    }

    // A curved branch line on the floor between the second and third gates.
    const branch = new QuadraticBezierCurve3(spots[1], new Vector3(3.8, 0, -2.2), spots[2]);
    const line = new Connection(args.lineage);
    const dots = 40;
    for (let i = 0; i < dots; i++) {
      const p = branch.getPointAt(i / (dots - 1));
      line.dots.setMatrixAt(i, new Matrix4().makeTranslation(p.x, 0.03, p.z));
    }
    line.dots.count = dots;
    line.material.opacity = 0.7;
    stage.add(line);

    const { drone } = spawnDrone(stage, spots[0].x, spots[0].z, { ...args, status: 'waiting' });
    const legs = [
      () => DroneFlight.to(drone, spots[1]),
      () => DroneFlight.along(drone, branch),
      () => DroneFlight.to(drone, spots[0]),
    ];
    let leg = 0;
    let flight: DroneFlight | undefined;
    let parked = 0;
    stage.onTick((dt) => {
      if (flight && !flight.done) {
        flight.update(dt);
        if (flight.done) drone.status = 'waiting';
        return;
      }
      flight?.update(dt); // level out after landing
      parked += dt;
      if (parked < 1.4) return;
      parked = 0;
      drone.status = 'working';
      flight = legs[leg]();
      leg = (leg + 1) % legs.length;
    });
    return root;
  },
};
