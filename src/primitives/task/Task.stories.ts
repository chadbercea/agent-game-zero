import type { Meta, StoryObj } from '@storybook/html-vite';
import { TaskAnimator } from '../../animation/TaskAnimator';
import { STATUSES, type Status } from '../../core/palette';
import type { Stage } from '../../stage/Stage';
import { FACE_CAMERA } from '../../stage/spawnDrone';
import { rowPosition, specimenStage } from '../../stage/specimen';
import { Task } from './Task';

interface TaskArgs {
  status: Status;
  subAgent: boolean;
}

const meta: Meta<TaskArgs> = {
  title: 'Primitives/Task',
  parameters: { layout: 'fullscreen' },
  argTypes: { status: { control: 'inline-radio', options: STATUSES } },
  args: { status: 'working', subAgent: false },
};
export default meta;

type Story = StoryObj<TaskArgs>;

function placeTask(stage: Stage, x: number, z: number, args: TaskArgs): Task {
  const task = new Task(args);
  task.position.set(x, 0, z);
  task.rotation.y = FACE_CAMERA;
  const animator = new TaskAnimator(task);
  stage.add(task);
  stage.onTick((dt) => animator.update(dt));
  return task;
}

/** One task without its drone. The tether runs up to where the drone would hover. */
export const Specimen: Story = {
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 4, focusY: 0.9 });
    placeTask(stage, 0, 0, args);
    return root;
  },
};

/** Stopped · Waiting · Working. */
export const StatusTrio: Story = {
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 4.6, focusY: 0.8 });
    STATUSES.forEach((status, i) => {
      const { x, z } = rowPosition(i, STATUSES.length, 2.6);
      placeTask(stage, x, z, { ...args, status });
    });
    return root;
  },
};

/** Cycles through every status so transitions (pop, shake, reveal) can be judged. */
export const Transitions: Story = {
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 4, focusY: 0.9 });
    const task = placeTask(stage, 0, 0, args);
    let clock = 0;
    let index = STATUSES.indexOf(args.status);
    stage.onTick((dt) => {
      clock += dt;
      if (clock < 2.5) return;
      clock = 0;
      index = (index + 1) % STATUSES.length;
      task.status = STATUSES[index];
    });
    return root;
  },
};
