import { Group, MathUtils, Vector3 } from 'three';
import { FACE_CAMERA } from '../../core/grid';
import type { SharedRun } from '../../core/sharedRuns';
import { Conduit } from '../conduit/Conduit';
import { Lock } from './Lock';

/** Where the lock floats above the tunnel, and how it bobs and turns. */
const LOCK_HEIGHT = 0.6;
const LOCK_BOB = 0.05;
const LOCK_SPIN = 0.6;
/** Small, but big enough to read at story zoom. */
const LOCK_SCALE = 1.8;

/**
 * Gateway primitive: the secure crossing between systems. A glass conduit
 * (see Conduit) with a small lock floating above its middle. `built` (0–1)
 * scales the tunnel up from nothing; `lockDrop` (0–1) brings the lock down
 * from where the security bot releases it to its float. `grant()` flashes
 * the tunnel and the lock green: access granted.
 */
export class Gateway extends Group {
  readonly conduit: Conduit;
  readonly lock = new Lock();
  /** World point the lock drops from (e.g. the security bot's body). */
  readonly dropFrom = new Vector3();
  private _built = 0;
  private _lockDrop = 0;
  private time = 0;

  constructor(readonly run: SharedRun) {
    super();
    this.conduit = new Conduit(run);
    this.conduit.level = 1;
    // Quiet inside until the lines connect to its ends (see the story): then the streams flow.
    this.conduit.streams = 0;
    this.add(this.conduit);
    this.lock.rotation.y = FACE_CAMERA;
    this.lock.scale.setScalar(LOCK_SCALE);
    this.add(this.lock);
    this.built = 0;
    this.lockDrop = 0;
  }

  /** The tunnel's middle on the floor. */
  get center(): Vector3 {
    return this.conduit.position.clone();
  }

  /** The tunnel's two ends on the floor, from → to along its run. */
  get ends(): [Vector3, Vector3] {
    const { run } = this;
    const across = (run.low + run.high) / 2;
    const at = (s: number) => (run.along === 'x' ? new Vector3(s, 0, across) : new Vector3(across, 0, s));
    return [at(run.from), at(run.to)];
  }

  /** How far the tunnel has scaled up (0–1). */
  get built(): number {
    return this._built;
  }

  set built(value: number) {
    this._built = MathUtils.clamp(value, 0, 1);
    this.conduit.scale.setScalar(Math.max(0.001, this._built));
    this.conduit.visible = this._built > 0.001;
  }

  /** How far the lock has dropped from the bot to its float (0 = not released, hidden). */
  get lockDrop(): number {
    return this._lockDrop;
  }

  set lockDrop(value: number) {
    this._lockDrop = MathUtils.clamp(value, 0, 1);
    this.lock.visible = this._lockDrop > 0.001;
    this.placeLock();
  }

  grant(): void {
    this.conduit.grant();
    this.lock.grant();
  }

  update(dt: number): void {
    this.time += dt;
    this.conduit.update(dt);
    this.lock.update(dt);
    this.placeLock();
  }

  dispose(): void {
    this.removeFromParent();
    this.conduit.dispose();
    this.lock.dispose();
  }

  private placeLock(): void {
    const float = this.center.setY(LOCK_HEIGHT + Math.sin(this.time * 1.6) * LOCK_BOB);
    // Ease from the drop point down to the float, landing softly.
    const e = 1 - (1 - this._lockDrop) ** 3;
    const from = this.worldToLocal(this.dropFrom.clone());
    this.lock.position.lerpVectors(from, float, e);
    this.lock.rotation.y = FACE_CAMERA + Math.sin(this.time * LOCK_SPIN) * 0.4;
  }
}
