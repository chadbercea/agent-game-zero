import type { Meta, StoryObj } from '@storybook/html-vite';
import { rowPosition, specimenStage } from '../../stage/specimen';
import { STATUSES } from '../../core/palette';
import { INCIDENT_KINDS, MONITOR_KINDS, SERVICE_KINDS, SYSTEM_KINDS, type SystemKind } from './emblems';
import { type NodeLight, SystemNode } from './SystemNode';

const meta: Meta = {
  title: 'Primitives/System Node',
  parameters: { layout: 'fullscreen' },
};
export default meta;

/**
 * Every system's emblem, in two rows. Back: the tools on Rovo's grid (Figma,
 * GitHub, Notion; Code search, Confluence, Jira, Bitbucket; Linear, Google
 * Docs, GitLab, Slack, the worktree). Front: Rovo on Call's (JSM, Compass,
 * Statuspage; Datadog, Grafana; the production services: web, API,
 * database, cache, queue). Monochrome; told apart by shape.
 */
export const Emblems: StoryObj = {
  render: () => {
    const { root, stage } = specimenStage({ viewSize: 10, focusY: 0.6 });
    const onCall = [...INCIDENT_KINDS, ...MONITOR_KINDS, ...SERVICE_KINDS] as readonly SystemKind[];
    const rows = [SYSTEM_KINDS.filter((k) => !onCall.includes(k)), onCall];
    rows.forEach((kinds, r) => {
      // Rows step toward the camera, along the floor.
      const toward = (r - 0.5) * 2.4 * Math.SQRT1_2;
      kinds.forEach((kind, i) => {
        const { x, z } = rowPosition(i, kinds.length, 1.4);
        const node = new SystemNode({ kind });
        node.position.set(x + toward, 0, z + toward);
        stage.add(node);
      });
    });
    return root;
  },
};

/**
 * One node under control: `kind` (which system), `light` (off, or the status
 * of the sub-agent working it), `dim` (0–1: how far out of reach it looks)
 * and `showLabel` (the name under it).
 */
export const Specimen: StoryObj<{ kind: SystemKind; light: NodeLight; dim: number; showLabel: boolean }> = {
  argTypes: {
    kind: { control: 'select', options: SYSTEM_KINDS },
    light: { control: 'inline-radio', options: ['off', ...STATUSES] },
    dim: { control: { type: 'range', min: 0, max: 1, step: 0.01 } },
  },
  args: { kind: 'github', light: 'working', dim: 0, showLabel: true },
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 2.4, focusY: 0.5 });
    const node = new SystemNode({ kind: args.kind, showLabel: args.showLabel });
    node.light = args.light;
    node.dim = args.dim;
    stage.add(node);
    return root;
  },
};
