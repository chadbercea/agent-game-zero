import { type Curve, LineCurve3, Vector3 } from 'three';
import { BEND_RADIUS, NODE_FOOTPRINT } from '../core/grid';
import { NEUTRAL } from '../core/palette';
import { Branch } from '../primitives/branch/Branch';
import { roundedPath, trimPolyline } from '../primitives/branch/gridPath';
import type { ScmKind } from '../primitives/node/emblems';
import { SystemNode } from '../primitives/node/SystemNode';
import { TERMINAL_SIZE, Terminal } from '../primitives/terminal/Terminal';
import type { SceneHost } from '../stage/Stage';
import { shoot } from './beam';
import { TWG_PLATE } from './rovoSystems';
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
const TERMINAL_X = 4;
const WORKTREE_X = 1.5;
/** Where the outer lanes turn to join the middle one, just before the repo's plate. */
const MERGE_X = 5.3;
export const ASSEMBLER_AT = new Vector3(9.5, 0, -5);
const BELT_FROM = new Vector3(10.4, 0, -5);
const BELT_LENGTH = 2.2;
export const PORTAL_AT = new Vector3(13.2, 0, -5);
/** The tie from Jira comes into the repo from this side, leaving the others to the lanes and the output. */
export const SCM_TIE_SIDE = new Vector3(0, 0, 1);
const HALF_NODE = NODE_FOOTPRINT / 2 + 0.08;
/** The repo stands on a Teamwork Graph plate: lines meet it at the plate's edge. */
const REPO_EDGE = TWG_PLATE / 2 + 0.05;
const HALF_TERMINAL = TERMINAL_SIZE / 2 + 0.06;
const CHECK_IN_SPEED = 6;

/**
 * One coding lane, built by the coding copy itself. The copy arrives at the
 * lane's spot, and the lane builds out from it (the system reacting to the
 * agent): the worktree grows in right under it; a line draws out to the
 * terminal, which appears; a line draws on into the repo (which comes up at
 * its end if it isn't there). Before the copy goes home it collapses the lane
 * back into itself: the repo line draws back, the terminal folds, the line
 * draws back, and the worktree folds under it (deleted with its branch).
 */
export class CodeLane {
  readonly terminal: Terminal;
  readonly worktree: SystemNode;
  /** Worktree → terminal. */
  readonly toTerminal: Branch;
  /** Terminal → repo (joining the other lanes' run into the repo). */
  readonly toRepo: Branch;
  /** Where the copy works: the worktree's place. */
  readonly spot: Vector3;
  private readonly untick: () => void;

  constructor(
    private readonly stage: SceneHost,
    readonly index: number,
    seed: number,
  ) {
    const z = LANE_Z[index];
    const terminalAt = new Vector3(TERMINAL_X, 0, z);
    this.spot = new Vector3(WORKTREE_X, 0, z);
    const intoRepo =
      z === SCM_AT.z
        ? [terminalAt.clone(), SCM_AT.clone()]
        : [terminalAt.clone(), new Vector3(MERGE_X, 0, z), new Vector3(MERGE_X, 0, SCM_AT.z), SCM_AT.clone()];
    this.toTerminal = new Branch(
      new LineCurve3(this.spot.clone().setX(WORKTREE_X + HALF_NODE), terminalAt.clone().setX(TERMINAL_X - HALF_TERMINAL)),
      NEUTRAL.packet,
    );
    this.toRepo = new Branch(roundedPath(trimPolyline(intoRepo, HALF_TERMINAL, REPO_EDGE), BEND_RADIUS), NEUTRAL.packet);
    this.terminal = new Terminal({ seed });
    this.terminal.position.copy(terminalAt);
    this.worktree = new SystemNode({ kind: 'worktree' });
    this.worktree.position.copy(this.spot);
    for (const line of [this.toTerminal, this.toRepo]) line.drawn = 0;
    for (const node of [this.terminal, this.worktree]) node.scale.setScalar(0.001);
    this.worktree.labelOpacity = 0;
    stage.add(this.toTerminal, this.toRepo, this.terminal, this.worktree);
    this.untick = stage.onTick((dt) => this.terminal.update(dt));
  }

  /** Built out from the copy over the spot: worktree; line, terminal; line, then the repo (`repo()` brings it up if needed). */
  async build(repo: () => Promise<unknown>): Promise<void> {
    const { stage } = this;
    await grow(stage, this.worktree, (t) => (this.worktree.labelOpacity = t));
    await tween(stage, 0.45, (t) => (this.toTerminal.drawn = t));
    await grow(stage, this.terminal);
    await tween(stage, 0.6, (t) => (this.toRepo.drawn = t));
    await repo();
  }

  /** The code is checked in: it rides out from the worktree, through the terminal, into the repo. */
  async checkIn(scm: ScmKind): Promise<void> {
    await shoot(this.stage, this.toTerminal.curve, CHECK_IN_SPEED, undefined, 'worktree');
    await shoot(this.stage, this.toRepo.curve, CHECK_IN_SPEED, undefined, scm);
  }

  /** Collapsed back into the copy: the repo line draws back, the terminal folds, the line draws back, the worktree folds. */
  async collapse(): Promise<void> {
    const { stage } = this;
    await tween(stage, 0.5, (t) => (this.toRepo.drawn = Math.max(0.001, 1 - t)));
    this.terminal.state = 'off';
    await grow(stage, this.terminal, undefined, true);
    await tween(stage, 0.4, (t) => (this.toTerminal.drawn = Math.max(0.001, 1 - t)));
    await grow(stage, this.worktree, (t) => (this.worktree.labelOpacity = t), true);
    this.collapsed = true;
  }

  /** The lane has folded back into its copy. */
  collapsed = false;

  dispose(): void {
    this.untick();
    this.worktree.dispose();
    this.terminal.dispose();
    this.toTerminal.dispose();
    this.toRepo.dispose();
  }

  positions(): Vector3[] {
    return [this.terminal.position, this.worktree.position];
  }
}

/** The output, built the first time code merges: the line draws out of the repo, then the assembler, belt and portal appear. */
export function buildOutput(stage: SceneHost): Promise<OutputLine> {
  const route: Curve<Vector3> = new LineCurve3(SCM_AT.clone().setX(SCM_AT.x + REPO_EDGE), ASSEMBLER_AT.clone().setX(ASSEMBLER_AT.x - 0.45));
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
