import { Group, Mesh, MeshStandardMaterial, TorusGeometry } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { NEUTRAL, STATUS_COLOR } from '../../core/palette';

let body: RoundedBoxGeometry | undefined;
let shackle: TorusGeometry | undefined;
let keyhole: RoundedBoxGeometry | undefined;

/** How fast the access-granted glow fades (per second). */
const GLOW_DECAY = 1.4;

/**
 * Lock primitive: a small padlock (white body, graphite shackle and keyhole)
 * that marks a secure gateway. `grant()` makes it glow green briefly:
 * access granted. Front faces local +Z.
 */
export class Lock extends Group {
  private readonly shell: MeshStandardMaterial;
  private readonly graphite: MeshStandardMaterial;
  private glow = 0;

  constructor() {
    super();
    this.shell = new MeshStandardMaterial({ color: NEUTRAL.shell, roughness: 0.35, metalness: 0.05 });
    this.graphite = new MeshStandardMaterial({ color: NEUTRAL.graphite, roughness: 0.4, metalness: 0.3 });
    for (const m of [this.shell, this.graphite]) m.emissive.copy(STATUS_COLOR.working);

    const b = new Mesh((body ??= new RoundedBoxGeometry(0.2, 0.16, 0.09, 3, 0.03)), this.shell);
    b.castShadow = true;
    b.position.y = 0.08;
    const s = new Mesh((shackle ??= new TorusGeometry(0.06, 0.017, 8, 20, Math.PI)), this.graphite);
    s.castShadow = true;
    s.position.y = 0.16;
    const k = new Mesh((keyhole ??= new RoundedBoxGeometry(0.03, 0.06, 0.01, 2, 0.008)), this.graphite);
    k.position.set(0, 0.075, 0.046);
    this.add(b, s, k);
    this.applyGlow();
  }

  /** Access granted: glow green, then settle. */
  grant(): void {
    this.glow = 1;
  }

  update(dt: number): void {
    this.glow = Math.max(0, this.glow - dt * GLOW_DECAY);
    this.applyGlow();
  }

  dispose(): void {
    this.removeFromParent();
    this.shell.dispose();
    this.graphite.dispose();
  }

  private applyGlow(): void {
    this.shell.emissiveIntensity = this.glow * 1.1;
    this.graphite.emissiveIntensity = this.glow * 1.6;
  }
}
