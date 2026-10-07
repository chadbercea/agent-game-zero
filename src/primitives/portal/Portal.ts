import {
  CircleGeometry,
  DoubleSide,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { solid } from '../../core/mesh';
import { LINEAGE, NEUTRAL } from '../../core/palette';
import { radialGlowTexture } from '../../core/textures';

/** The portal's opening: its radius, and how high its middle stands. */
export const PORTAL_RADIUS = 0.62;
export const PORTAL_CENTER_Y = 0.32 + PORTAL_RADIUS;
/** Another realm's color: violet, apart from status and the graph's blue. */
const REALM = LINEAGE.violet;
const ARMS = 4;

/**
 * Portal primitive: a way out to another realm. A white ring standing on a
 * small base, its opening facing along local +x, with a swirling violet
 * inside and a soft glow. Where it leads isn't shown.
 *
 * Rig hooks: `open` (0–1) grows the swirl in and out (0 = closed, just the
 * ring); `gulp()` flashes it as something goes through; `update(dt)` spins
 * the swirl.
 */
export class Portal extends Group {
  private readonly swirl = new Group();
  private readonly disc: Mesh;
  private readonly arms: Mesh[] = [];
  private readonly glow: Sprite;
  private readonly materials: (MeshStandardMaterial | MeshBasicMaterial | SpriteMaterial)[];
  private _open = 0;
  private flash = 0;

  constructor() {
    super();
    const shell = new MeshStandardMaterial({ color: NEUTRAL.shell, roughness: 0.45, flatShading: true });
    const graphite = new MeshStandardMaterial({ color: NEUTRAL.graphite, roughness: 0.5, flatShading: true });
    const discMaterial = new MeshBasicMaterial({ color: REALM, transparent: true, opacity: 0, side: DoubleSide, depthWrite: false });
    const armMaterial = new MeshBasicMaterial({ color: NEUTRAL.backdrop, transparent: true, opacity: 0, side: DoubleSide, depthWrite: false });
    const glowMaterial = new SpriteMaterial({ map: radialGlowTexture(), color: REALM, transparent: true, opacity: 0, depthWrite: false });
    this.materials = [shell, graphite, discMaterial, armMaterial, glowMaterial];

    const base = solid(new RoundedBoxGeometry(0.34, 0.16, 1.1, 2, 0.04), graphite);
    base.position.y = 0.08;
    this.add(base);
    // The ring stands upright; its opening faces along +x.
    const frame = new Group();
    frame.position.y = PORTAL_CENTER_Y;
    frame.rotation.y = Math.PI / 2;
    this.add(frame);
    frame.add(solid(new TorusGeometry(PORTAL_RADIUS, 0.09, 8, 28), shell));

    this.disc = new Mesh(new CircleGeometry(PORTAL_RADIUS * 0.96, 32), discMaterial);
    frame.add(this.disc);
    // The swirl: spiral arms turning inside the disc.
    frame.add(this.swirl);
    for (let i = 0; i < ARMS; i++) {
      const arm = new Mesh(new TorusGeometry(PORTAL_RADIUS * (0.32 + i * 0.14), 0.018, 4, 20, Math.PI * 0.8), armMaterial);
      arm.rotation.z = (i / ARMS) * Math.PI * 2;
      arm.position.z = 0.01;
      this.swirl.add(arm);
      this.arms.push(arm);
    }
    this.glow = new Sprite(glowMaterial);
    this.glow.position.y = PORTAL_CENTER_Y;
    this.add(this.glow);
    this.open = 0;
  }

  /** 0 = closed (just the ring), 1 = open. */
  get open(): number {
    return this._open;
  }

  set open(value: number) {
    this._open = MathUtils.clamp(value, 0, 1);
    this.apply();
  }

  /** Something just went through: a bright flash that settles. */
  gulp(): void {
    this.flash = 1;
  }

  update(dt: number): void {
    this.swirl.rotation.z -= dt * (1.4 + this.flash * 4);
    this.flash = Math.max(0, this.flash - dt * 2);
    this.apply();
  }

  dispose(): void {
    this.removeFromParent();
    for (const m of this.materials) m.dispose();
  }

  private apply(): void {
    const o = this._open;
    const [, , disc, arm, glow] = this.materials;
    disc.opacity = o * (0.75 + this.flash * 0.25);
    arm.opacity = o * 0.55;
    glow.opacity = o * 0.45 + this.flash * 0.5;
    this.swirl.scale.setScalar(Math.max(0.001, o));
    this.disc.scale.setScalar(Math.max(0.001, o));
    this.glow.scale.setScalar(2.2 * o + this.flash * 1.4);
  }
}
