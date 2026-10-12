import { BoxGeometry, CylinderGeometry, Group, MathUtils, MeshStandardMaterial, SphereGeometry } from 'three';
import { solid } from '../../core/mesh';
import { NEUTRAL } from '../../core/palette';

const POLE = 0.62;
const BANNER_W = 0.26;
const BANNER_H = 0.16;

/**
 * Flag primitive: a feature flag on a service. A graphite pole with a white
 * banner. Rig hook: `raised` (0–1): 1 = the flag is on (banner at the top),
 * 0 = off (lowered to the foot of the pole). No color: on and off read by
 * where the banner is.
 */
export class Flag extends Group {
  private readonly banner: Group;
  private readonly materials: MeshStandardMaterial[];
  private _raised = 1;

  constructor() {
    super();
    const shell = new MeshStandardMaterial({ color: NEUTRAL.shell, roughness: 0.45, flatShading: true });
    const graphite = new MeshStandardMaterial({ color: NEUTRAL.graphite, roughness: 0.5, flatShading: true });
    this.materials = [shell, graphite];
    this.add(solid(new CylinderGeometry(0.06, 0.07, 0.04, 10), graphite)).position.y = 0.02;
    this.add(solid(new CylinderGeometry(0.014, 0.014, POLE, 6), graphite)).position.y = POLE / 2;
    this.add(solid(new SphereGeometry(0.026, 8, 6), graphite)).position.y = POLE + 0.01;
    this.banner = new Group();
    const cloth = solid(new BoxGeometry(BANNER_W, BANNER_H, 0.016), shell);
    cloth.position.x = BANNER_W / 2 + 0.014;
    this.banner.add(cloth);
    this.add(this.banner);
    this.raised = 1;
  }

  get raised(): number {
    return this._raised;
  }

  set raised(value: number) {
    this._raised = MathUtils.clamp(value, 0, 1);
    const low = 0.06 + BANNER_H / 2;
    const high = POLE - BANNER_H / 2;
    this.banner.position.y = MathUtils.lerp(low, high, this._raised);
  }

  dispose(): void {
    this.removeFromParent();
    for (const m of this.materials) m.dispose();
  }
}
