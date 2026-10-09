import { type Curve, LineCurve3, Vector3 } from 'three';
import { BEND_RADIUS, NODE_FOOTPRINT } from '../core/grid';
import { NEUTRAL } from '../core/palette';
import { Branch } from '../primitives/branch/Branch';
import { reversed, roundedPath, trimPolyline } from '../primitives/branch/gridPath';
import type { ScmKind } from '../primitives/node/emblems';
import { SystemNode } from '../primitives/node/SystemNode';
import { TERMINAL_SIZE, Terminal } from '../primitives/terminal/Terminal';
import type { SceneHost } from '../stage/Stage';
import { shoot } from './beam';
import { type OutputLine, shipOutput } from './shipOutput';
import { tween } from './timeline';

/**
 * The code side of Rovo's grid (docs/rovo-mental-model.md, "Code"), on the
 * open right past the gate. One repo (the run's SCM); up to three lanes
 * into it, each a worktree (where a coding copy works) → its terminal → the
 * repo, all merging into one run into the repo like branches into main;
 * and out of the repo, the output line to the assembler, the short fast belt
 * and the portal.
 */
export const SCM_AT = new Vector3(7, 0, -5);
/** Lanes, side by side along z; the middle one runs straight into the repo. */
export const LANE_Z = [-5, -3, -7] as const;
const TERMINAL_X = 4.5;
const WORKTREE_X = 2;
/** Where the outer lanes turn to join the middle one, just before the repo. */
const MERGE_X = 5.75;
export const ASSEMBLER_AT = new Vector3(9.5, 0, -5);
const BELT_FROM = new Vector3(10.4, 0, -5);
const BELT_LENGTH = 2.2;
export const PORTAL_AT = new Vector3(13.2, 0, -5);
/** The tie from Jira comes into the repo from this side, leaving the others to the lanes and the output. */
export const SCM_TIE_SIDE = new Vector3(0, 0, 1);
const HALF_NODE = NODE_FOOTPRINT / 2 + 0.08;
const HALF_TERMINAL = TERMINAL_SIZE / 2 + 0.06;
const CHECK_IN_SPEED = 6;

/**
 * One coding lane: a worktree and its terminal, joined to the repo. It's
 * built when a code task needs it (the line draws out from the repo, then
 * the terminal appears; the next line draws, then the worktree appears) and
 * taken down again when the task is done (the worktree is deleted with its
 * branch): nodes fold, then their lines draw back.
 */
export class CodeLane {
  readonly terminal: Terminal;
  readonly worktree: SystemNode;
  /** Repo → terminal (drawn from the repo's end). */
  readonly toTerminal: Branch;
  /** Terminal → worktree. */
  readonly toWorktree: Branch;
  private readonly untick: () => void;

  constructor(
    private readonly stage: SceneHost,
    readonly index: number,
    seed: number,
  ) {
    const z = LANE_Z[index];
    const terminalAt = new Vector3(TERMINAL_X, 0, z);
    const worktreeAt = new Vector3(WORKTREE_X, 0, z);
    const toRepo =
      z === SCM_AT.z
        ? [SCM_AT.clone(), terminalAt.clone()]
        : [SCM_AT.clone(), new Vector3(MERGE_X, 0, SCM_AT.z), new Vector3(MERGE_X, 0, z), terminalAt.clone()];
    this.toTerminal = new Branch(roundedPath(trimPolyline(toRepo, HALF_NODE, HALF_TERMINAL), BEND_RADIUS), NEUTRAL.packet);
    this.toWorktree = new Branch(
      new LineCurve3(terminalAt.clone().setX(TERMINAL_X - HALF_TERMINAL), worktreeAt.clone().setX(WORKTREE_X + HALF_NODE)),
      NEUTRAL.packet,
    );
    this.terminal = new Terminal({ seed });
    this.terminal.position.copy(terminalAt);
    this.worktree = new SystemNode({ kind: 'worktree' });
    this.worktree.position.copy(worktreeAt);
    for (const line of [this.toTerminal, this.toWorktree]) line.drawn = 0;
    for (const node of [this.terminal, this.worktree]) node.scale.setScalar(0.001);
    this.worktree.labelOpacity = 0;
    stage.add(this.toTerminal, this.toWorktree, this.terminal, this.worktree);
    this.untick = stage.onTick((dt) => this.terminal.update(dt));
  }

  /** Line, then terminal; line, then worktree. */
  async build(): Promise<void> {
    const { stage } = this;
    await tween(stage, 0.6, (t) => (this.toTerminal.drawn = t));
    await grow(stage, this.terminal);
    await tween(stage, 0.45, (t) => (this.toWorktree.drawn = t));
    await grow(stage, this.worktree, (t) => (this.worktree.labelOpacity = t));
  }

  /** The code is checked in: it rides from the worktree through the terminal into the repo. */
  async checkIn(scm: ScmKind): Promise<void> {
    await shoot(this.stage, reversed(this.toWorktree.curve), CHECK_IN_SPEED, undefined, 'worktree');
    await shoot(this.stage, reversed(this.toTerminal.curve), CHECK_IN_SPEED, undefined, scm);
  }

  /** The worktree is deleted with its branch: worktree folds, its line draws back, the terminal folds, its line draws back. */
  async teardown(): Promise<void> {
    const { stage } = this;
    await grow(stage, this.worktree, (t) => (this.worktree.labelOpacity = t), true);
    await tween(stage, 0.4, (t) => (this.toWorktree.drawn = Math.max(0.001, 1 - t)));
    this.terminal.state = 'off';
    await grow(stage, this.terminal, undefined, true);
    await tween(stage, 0.5, (t) => (this.toTerminal.drawn = Math.max(0.001, 1 - t)));
    this.untick();
    this.worktree.dispose();
    this.terminal.dispose();
    this.toTerminal.dispose();
    this.toWorktree.dispose();
  }

  positions(): Vector3[] {
    return [this.terminal.position, this.worktree.position];
  }
}

/** The output, built the first time code merges: the line draws out of the repo, then the assembler, belt and portal appear. */
export function buildOutput(stage: SceneHost): Promise<OutputLine> {
  const route: Curve<Vector3> = new LineCurve3(SCM_AT.clone().setX(SCM_AT.x + HALF_NODE), ASSEMBLER_AT.clone().setX(ASSEMBLER_AT.x - 0.45));
  return shipOutput(stage, { route, assembler: ASSEMBLER_AT, beltFrom: BELT_FROM, beltLength: BELT_LENGTH, beltSpeed: 2.2, portal: PORTAL_AT });
}

/** Grow a thing in at its place (or fold it away, `out`), easing with a little overshoot. */
async function grow(stage: SceneHost, node: { scale: Vector3 }, extra?: (t: number) => void, out = false): Promise<void> {
  await tween(stage, out ? 0.35 : 0.4, (t) => {
    const k = out ? 1 - t : easeOutBack(t);
    node.scale.setScalar(Math.max(0.001, k));
    extra?.(out ? 1 - t : t);
  });
}

function easeOutBack(t: number): number {
  const c = 1.6;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}
