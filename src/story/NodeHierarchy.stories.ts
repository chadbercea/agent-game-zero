import type { Meta, StoryObj } from '@storybook/html-vite';
import { LineCurve3, Vector3 } from 'three';
import { GateAnimator } from '../animation/GateAnimator';
import { LINEAGES, type Lineage, NEUTRAL } from '../core/palette';
import { Branch } from '../primitives/branch/Branch';
import { Gate, type GateState } from '../primitives/gate/Gate';
import { SYSTEM_KINDS, type SystemKind } from '../primitives/node/emblems';
import { SystemNode } from '../primitives/node/SystemNode';
import type { SceneHost } from '../stage/Stage';
import { specimenStage } from '../stage/specimen';
import {
  type Direction,
  DIRECTIONS,
  type HierarchyNode,
  NODE_STATES,
  type NodeState,
  secondary,
  tertiary,
  tertiaryOffset,
} from './nodeHierarchy';
import { tween, wait } from './timeline';

const meta: Meta = {
  title: 'Story Parts/Node Hierarchy',
  parameters: { layout: 'fullscreen' },
};
export default meta;

/** Screen-right on the floor: gate → tool → tertiary run left to right in each row. */
const RIGHT = new Vector3(1, 0, -1).normalize();
/** Rows step down the screen. */
const DOWN = new Vector3(1, 0, 1).normalize();

interface Row {
  gate: Gate;
  tool: HierarchyNode | SystemNode;
  tert: HierarchyNode | SystemNode;
}

/** One gate → tool → tertiary row at `origin`, joined by access traces. */
function row(stage: SceneHost, origin: Vector3, direction: Direction | 'today', kind: SystemKind, owner: Lineage): Row {
  const gate = new Gate();
  gate.position.copy(origin);
  const animator = new GateAnimator(gate);
  stage.onTick((dt) => animator.update(dt));
  const toolAt = origin.clone().addScaledVector(RIGHT, 3);
  let tool: HierarchyNode | SystemNode;
  let tert: HierarchyNode | SystemNode;
  if (direction === 'today') {
    tool = new SystemNode({ kind, showLabel: false });
    tert = new SystemNode({ kind, showLabel: false });
    tert.scale.setScalar(0.55);
    tert.position.copy(toolAt).add(tertiaryOffset('puck'));
  } else {
    tool = secondary(direction, kind);
    tert = tertiary(direction, owner);
    tert.position.copy(toolAt).add(tertiaryOffset(direction));
  }
  tool.position.copy(toolAt);
  const trace = new Branch(new LineCurve3(origin.clone().addScaledVector(RIGHT, 0.85), toolAt.clone().addScaledVector(RIGHT, -0.6)), NEUTRAL.packet);
  trace.drawn = 1;
  // The tertiary's tie to its tool: a short trace, only while it's there.
  const tie = new Branch(new LineCurve3(toolAt.clone(), tert.position.clone()), NEUTRAL.packet);
  tie.drawn = 1;
  tie.material.opacity = 0.5;
  stage.onTick(() => (tie.visible = tert.visible && tert.scale.x > 0.2));
  stage.add(gate, trace, tie, tool, tert);
  stage.onTick((dt) => {
    if ('update' in tool && !(tool instanceof SystemNode)) tool.update(dt);
    if ('update' in tert && !(tert instanceof SystemNode)) tert.update(dt);
  });
  return { gate, tool, tert };
}

/** Drive a row's states: today's look uses its pad light; the options use their own state. */
function setRow(r: Row, gate: GateState, tool: NodeState, tert: NodeState): void {
  r.gate.state = gate;
  for (const [node, state] of [
    [r.tool, tool],
    [r.tert, tert],
  ] as const) {
    if (node instanceof SystemNode) node.light = state === 'resting' ? 'off' : state === 'active' ? 'working' : 'waiting';
    else node.state = state;
  }
}

/**
 * All the options side by side, one row each, top to bottom: today (tools
 * are smaller gates: the problem), then the puck, hex and float directions.
 * Every row plays the same beat on loop: the gate checks (yellow) and grants
 * (green); the tool lights as an agent uses it; a tertiary grows off the tool
 * for a second agent, works, and is released. The gate is the same in every
 * row: it's the reference the others are designed against. No captions.
 */
export const Compare: StoryObj = {
  render: () => {
    const { root, stage } = specimenStage({ viewSize: 12, focusY: 0.4 });
    const rows = (['today', ...DIRECTIONS] as const).map((d, i) =>
      row(stage, new Vector3(-3, 0, -3).addScaledVector(DOWN, i * 2.6), d, 'jira', 'violet'),
    );
    stage.centerOn(rows[1].tool.position.clone().lerp(rows[2].tool.position, 0.5).add(RIGHT.clone().multiplyScalar(-0.6)).setY(0.4));
    void (async () => {
      for (;;) {
        rows.forEach((r) => setRow(r, 'off', 'resting', 'resting'));
        rows.forEach((r) => (r.tert.visible = false));
        await wait(stage, 1);
        rows.forEach((r) => setRow(r, 'thinking', 'resting', 'resting'));
        await wait(stage, 1.2);
        rows.forEach((r) => setRow(r, 'open', 'resting', 'resting'));
        await wait(stage, 0.8);
        rows.forEach((r) => setRow(r, 'open', 'active', 'resting'));
        await wait(stage, 1.4);
        // A second agent: its tertiary grows off the tool, works, waits a beat, works again, and is released.
        rows.forEach((r) => (r.tert.visible = true));
        const base = rows.map((r) => r.tert.scale.x || 1);
        await tween(stage, 0.5, (t) => rows.forEach((r, i) => r.tert.scale.setScalar(Math.max(0.001, (i === 0 ? 0.55 : 1) * t))));
        rows.forEach((r) => setRow(r, 'open', 'active', 'active'));
        await wait(stage, 1.4);
        rows.forEach((r) => setRow(r, 'open', 'active', 'waiting'));
        await wait(stage, 1);
        rows.forEach((r) => setRow(r, 'open', 'active', 'active'));
        await wait(stage, 1);
        await tween(stage, 0.4, (t) => rows.forEach((r, i) => r.tert.scale.setScalar(Math.max(0.001, (i === 0 ? 0.55 : 1) * (1 - t)))));
        rows.forEach((r, i) => r.tert.scale.setScalar(base[i]));
        rows.forEach((r) => setRow(r, 'open', 'resting', 'resting'));
        await wait(stage, 1.2);
      }
    })();
    return root;
  },
};

interface OptionArgs {
  gate: GateState;
  tool: NodeState;
  tertiary: NodeState;
  kind: SystemKind;
  owner: Lineage;
}

function option(direction: Direction): StoryObj<OptionArgs> {
  return {
    argTypes: {
      gate: { control: 'inline-radio', options: ['off', 'thinking', 'open', 'denied'] },
      tool: { control: 'inline-radio', options: NODE_STATES },
      tertiary: { control: 'inline-radio', options: NODE_STATES },
      kind: { control: 'select', options: SYSTEM_KINDS },
      owner: { control: 'select', options: LINEAGES },
    },
    args: { gate: 'open', tool: 'active', tertiary: 'active', kind: 'jira', owner: 'violet' },
    render: (args) => {
      const { root, stage } = specimenStage({ viewSize: 6, focusY: 0.5 });
      const r = row(stage, new Vector3(-1.5, 0, 1.5), direction, args.kind, args.owner);
      stage.centerOn(r.gate.position.clone().lerp(r.tool.position, 0.5).setY(0.5));
      setRow(r, args.gate, args.tool, args.tertiary);
      return root;
    },
  };
}

/** Puck: round tools on a low puck lit by a ring; tertiaries are small pucks ringed in their agent's color. Controls set each level's state. */
export const Puck = option('puck');
/** Hex: tools are flat hexagon tiles whose edge lights; tertiaries are half-size hexes docked on the tool's edge. */
export const Hex = option('hex');
/** Float: no base; a bigger emblem floats over a halo that takes the state; tertiaries are a mote over their own small halo. */
export const Float = option('float');
