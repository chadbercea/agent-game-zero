import { BoxGeometry, Group, MathUtils, MeshStandardMaterial, SphereGeometry } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { solid } from '../../core/mesh';
import { NEUTRAL, STATUS_COLOR } from '../../core/palette';
import { BELT_TOP } from '../conveyor/Conveyor';

/** How tall the opening the belt runs through is. */
const MOUTH = 0.55;
const SPAN = 0.86;
const DEPTH = 0.62;

/**
 * Minter primitive: the little machine that turns work into money (ILI-975).
 * A white housing that straddles a conveyor belt (its local +x runs along
 * the belt), with an opening the belt runs through, a stamp on top, and a
 * lamp. `stamp()` presses the stamp and lights the lamp green as something
 * is converted; `update(dt)` settles them back.
 */
export class Minter extends Group {
  private readonly ram: Group;
  private readonly lamp: MeshStandardMaterial;
  private readonly materials: MeshStandardMaterial[];
  private press = 0;

  constructor() {
    super();
    const shell = new MeshStandardMaterial({ color: NEUTRAL.shell, roughness: 0.4 });
    const graphite = new MeshStandardMaterial({ color: NEUTRAL.graphite, roughness: 0.5, flatShading: true });
    this.lamp = new MeshStandardMaterial({ color: NEUTRAL.offLight, emissive: STATUS_COLOR.working, emissiveIntensity: 0 });
    this.materials = [shell, graphite, this.lamp];
    const top = BELT_TOP + MOUTH;
    // Two side walls either side of the belt, and a roof over it.
    for (const side of [-1, 1]) {
      const wall = solid(new RoundedBoxGeometry(SPAN, top, 0.12, 2, 0.03), shell);
      wall.position.set(0, top / 2, side * (DEPTH / 2 + 0.06));
      this.add(wall);
    }
    const roof = solid(new RoundedBoxGeometry(SPAN, 0.26, DEPTH + 0.36, 2, 0.05), shell);
    roof.position.set(0, top + 0.13, 0);
    this.add(roof);
    // The mouth's dark lip on both ends, so the opening reads.
    for (const end of [-1, 1]) {
      const lip = solid(new BoxGeometry(0.04, 0.06, DEPTH + 0.2), graphite);
      lip.position.set((end * SPAN) / 2, top - 0.02, 0);
      this.add(lip);
    }
    // The stamp: a graphite ram on top that presses down.
    this.ram = new Group();
    this.ram.add(solid(new BoxGeometry(0.18, 0.22, 0.18), graphite));
    this.ram.position.set(0, top + 0.37, 0);
    this.add(this.ram);
    // The lamp.
    const lamp = solid(new SphereGeometry(0.06, 12, 8), this.lamp);
    lamp.position.set(SPAN / 2 - 0.12, top + 0.3, DEPTH / 2);
    this.add(lamp);
  }

  /** Something just went through and came out as money: press, and light up. */
  stamp(): void {
    this.press = 1;
  }

  update(dt: number): void {
    this.press = Math.max(0, this.press - dt * 2.5);
    const p = Math.sin(MathUtils.clamp(this.press, 0, 1) * Math.PI);
    this.ram.position.y = BELT_TOP + MOUTH + 0.37 - p * 0.12;
    this.lamp.emissiveIntensity = this.press * 1.8;
    this.lamp.color.set(this.press > 0.05 ? 0xffffff : NEUTRAL.offLight);
  }

  dispose(): void {
    this.removeFromParent();
    for (const m of this.materials) m.dispose();
  }
}
