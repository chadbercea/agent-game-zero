import type { Meta, StoryObj } from '@storybook/html-vite';
import { JOB_KINDS, type JobKind } from '../node/emblems';
import { SystemNode } from '../node/SystemNode';
import { FACE_CAMERA } from '../../stage/spawnDrone';
import { rowPosition, specimenStage } from '../../stage/specimen';
import { Job } from './Job';

interface JobArgs {
  /** Seconds per job loop. */
  seconds: number;
}

const meta: Meta<JobArgs> = {
  title: 'Primitives/Job',
  parameters: { layout: 'fullscreen' },
  argTypes: { seconds: { control: { type: 'range', min: 2, max: 12, step: 0.5 } } },
  args: { seconds: 5 },
};
export default meta;

/** The three jobs on their nodes, looping 0 → 100%: report stack, branch + git init, read. */
export const Jobs: StoryObj<JobArgs> = {
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 4.5, focusY: 0.5 });
    const jobs = JOB_KINDS.map((kind, i) => {
      const { x, z } = rowPosition(i, JOB_KINDS.length, 2.4);
      const node = new SystemNode({ kind });
      node.position.set(x, 0, z);
      node.emblem.visible = false;
      node.light = 'working';
      const job = new Job(kind);
      job.position.copy(node.position);
      job.rotation.y = FACE_CAMERA;
      stage.add(node, job);
      return job;
    });
    let t = 0;
    stage.onTick((dt) => {
      t = (t + dt / args.seconds) % 1.25; // hold briefly at 100% before looping
      for (const job of jobs) {
        job.progress = Math.min(1, t);
        job.update(dt);
      }
    });
    return root;
  },
};

/** One job up close, looping: pick the system. */
export const Single: StoryObj<JobArgs & { kind: JobKind }> = {
  argTypes: { kind: { control: 'inline-radio', options: JOB_KINDS } },
  args: { kind: 'figma', seconds: 6 },
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 1.8, focusY: 0.6 });
    const node = new SystemNode({ kind: args.kind });
    node.emblem.visible = false;
    node.light = 'working';
    const job = new Job(args.kind);
    job.rotation.y = FACE_CAMERA;
    stage.add(node, job);
    let t = 0;
    stage.onTick((dt) => {
      t = (t + dt / args.seconds) % 1.25;
      job.progress = Math.min(1, t);
      job.update(dt);
    });
    return root;
  },
};

/** One job held at a point: the controls set the Job's `kind` and `progress` (0–1) directly. */
export const Progress: StoryObj<{ kind: JobKind; progress: number }> = {
  argTypes: { kind: { control: 'inline-radio', options: JOB_KINDS }, progress: { control: { type: 'range', min: 0, max: 1, step: 0.01 } } },
  args: { kind: 'github', progress: 0.5 },
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 1.8, focusY: 0.6 });
    const node = new SystemNode({ kind: args.kind });
    node.emblem.visible = false;
    node.light = 'working';
    const job = new Job(args.kind);
    job.rotation.y = FACE_CAMERA;
    job.progress = args.progress;
    stage.add(node, job);
    stage.onTick((dt) => job.update(dt));
    return root;
  },
};
