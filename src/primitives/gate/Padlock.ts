import { CylinderGeometry, Group, type Material, MeshStandardMaterial, TorusGeometry } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { FACE_CAMERA } from '../../core/grid';
import { solid } from '../../core/mesh';
import { NEUTRAL } from '../../core/palette';

const BODY_W = 0.5;
const BODY_H = 0.4;
const SHACKLE_R = 0.15;
/** How far the shackle stands up out of the body when open. */
const OPEN_LIFT = 0.14;

/**
 * A padlock: a gate locked behind an agent once it's through, for security.
 * White body, graphite shackle and keyhole, facing the camera. `shown` fades
 * it in (0–1); `shut` drops the shackle into the body (0 open, 1 locked).
 */
export class Padlock extends Group {
  private readonly shackle = new Group();
  private readonly materials: Material[];
  private _shown = 1;
  private _shut = 1;

  constructor() {
    super();
    const shell = new MeshStandardMaterial({ color: NEUTRAL.shell, roughness: 0.45, transparent: true });
    const graphite = new MeshStandardMaterial({ color: NEUTRAL.graphite, roughness: 0.4, metalness: 0.2, transparent: true });
    this.materials = [shell, graphite];
    const lock = new Group();
    lock.rotation.y = FACE_CAMERA;
    this.add(lock);

    lock.add(solid(new RoundedBoxGeometry(BODY_W, BODY_H, 0.2, 3, 0.06), shell));
    const hole = solid(new CylinderGeometry(0.045, 0.045, 0.02, 12), graphite);
    hole.rotation.x = Math.PI / 2;
    hole.position.set(0, 0.03, 0.1);
    const slot = solid(new RoundedBoxGeometry(0.035, 0.1, 0.02, 1, 0.01), graphite);
    slot.position.set(0, -0.04, 0.1);
    lock.add(hole, slot);

    const arc = solid(new TorusGeometry(SHACKLE_R, 0.035, 8, 20, Math.PI), graphite);
    arc.position.y = 0.12;
    const leg = new CylinderGeometry(0.035, 0.035, 0.14, 8);
    for (const side of [-1, 1]) {
      const l = solid(leg, graphite);
      l.position.set(side * SHACKLE_R, 0.05, 0);
      this.shackle.add(l);
    }
    this.shackle.add(arc);
    this.shackle.position.y = BODY_H / 2 - 0.04;
    lock.add(this.shackle);
    this.apply();
  }

  get shown(): number {
    return this._shown;
  }

  set shown(value: number) {
    this._shown = Math.min(1, Math.max(0, value));
    this.apply();
  }

  get shut(): number {
    return this._shut;
  }

  set shut(value: number) {
    this._shut = Math.min(1, Math.max(0, value));
    this.apply();
  }

  dispose(): void {
    this.removeFromParent();
    for (const m of this.materials) m.dispose();
  }

  private apply(): void {
    this.visible = this._shown > 0;
    for (const m of this.materials) {
      m.opacity = this._shown;
      m.depthWrite = this._shown >= 1;
    }
    this.shackle.position.y = BODY_H / 2 - 0.04 + OPEN_LIFT * (1 - this._shut);
  }
}
