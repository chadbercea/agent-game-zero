import { Group, type Vector3 } from 'three';
import type { SceneHost } from '../stage/Stage';
import { A_CENTER, OneTicket } from './oneTicket';
import { B_CENTER, OneTicketB } from './oneTicketB';
import { wait } from './timeline';

/** Seconds each version holds on its finished state before the scene clears. */
export const FULL_HOLD = 3;
/** Seconds of empty grid between the versions. */
export const FULL_GAP = 1;

/** Which version is on screen, if any. */
export type FullPhase = 'a' | 'b' | 'clear';

/**
 * The whole one-ticket story (ILI-967): Version A, then Version B, the same
 * work done two ways. Each version lives in its own group on the stage, and
 * only one is ever shown: between them the scene clears to the empty grid,
 * so B starts from the same nothing A did. `frame` points the camera at a
 * version's layout as it comes on (a cut, never a pan).
 */
export class OneTicketFull {
  readonly a: OneTicket;
  readonly b: OneTicketB;
  readonly groupA = new Group();
  readonly groupB = new Group();
  phase: FullPhase = 'clear';

  constructor(
    private readonly stage: SceneHost,
    private readonly frame: (center: Vector3) => void = () => {},
  ) {
    stage.add(this.groupA, this.groupB);
    this.a = new OneTicket(within(stage, this.groupA));
    this.b = new OneTicketB(within(stage, this.groupB));
    this.show('clear');
  }

  /** Play A, hold, clear; then B, hold, clear. */
  async play(): Promise<void> {
    const { stage } = this;
    this.show('a');
    await this.a.play();
    await wait(stage, FULL_HOLD);
    await this.a.reset();
    this.show('clear');
    await wait(stage, FULL_GAP);
    this.show('b');
    await this.b.play();
    await wait(stage, FULL_HOLD);
    await this.b.reset();
    this.show('clear');
  }

  private show(phase: FullPhase): void {
    this.phase = phase;
    this.groupA.visible = phase === 'a';
    this.groupB.visible = phase === 'b';
    if (phase !== 'clear') this.frame(phase === 'a' ? A_CENTER : B_CENTER);
  }
}

/** A scene host whose objects go into `group` (so a version shows and hides as one), on the stage's clock. */
function within(stage: SceneHost, group: Group): SceneHost {
  return {
    add: (...objects) => void group.add(...objects),
    onTick: (fn) => stage.onTick(fn),
  } as SceneHost;
}
