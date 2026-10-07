import { type Color, Group, MathUtils, Mesh, MeshBasicMaterial, SphereGeometry, Sprite, SpriteMaterial, TorusGeometry } from 'three';
import { radialGlowTexture } from '../../core/textures';

const DOTS = 8;
const RADIUS = 0.62;
/** Turns per second around the agent. */
const SPIN = 0.55;

let dotGeometry: SphereGeometry | undefined;

/**
 * Charge primitive: an agent powered up. A soft glow behind the agent and a
 * tilted ring of bright dots orbiting it, in the color of what powered it
 * (the Teamwork Graph's blue). Attach it to an agent's hover point.
 *
 * Rig hooks: `level` (0–1) brings it in (0 = off); `burst()` gives a quick
 * flare, for the moment it charges; `update(dt)` spins the ring.
 */
export class Charge extends Group {
  private readonly ring = new Group();
  private readonly dotMaterial: MeshBasicMaterial;
  private readonly bandMaterial: MeshBasicMaterial;
  private readonly glowMaterial: SpriteMaterial;
  private readonly glow: Sprite;
  private _level = 0;
  private flare = 0;
  private time = 0;

  constructor(color: Color) {
    super();
    dotGeometry ??= new SphereGeometry(0.045, 8, 6);
    this.dotMaterial = new MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false });
    this.bandMaterial = new MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false });
    this.glowMaterial = new SpriteMaterial({ map: radialGlowTexture(), color, transparent: true, opacity: 0, depthWrite: false });
    this.glow = new Sprite(this.glowMaterial);
    this.add(this.glow);
    // The ring tilts toward the camera so it reads as an orbit, not a line.
    this.ring.rotation.set(1.15, 0, 0.35);
    this.ring.add(new Mesh(new TorusGeometry(RADIUS, 0.012, 4, 48), this.bandMaterial));
    for (let i = 0; i < DOTS; i++) {
      const dot = new Mesh(dotGeometry, this.dotMaterial);
      const a = (i / DOTS) * Math.PI * 2;
      dot.position.set(Math.cos(a) * RADIUS, Math.sin(a) * RADIUS, 0);
      this.ring.add(dot);
    }
    this.add(this.ring);
    this.level = 0;
  }

  /** 0 = off, 1 = fully charged. */
  get level(): number {
    return this._level;
  }

  set level(value: number) {
    this._level = MathUtils.clamp(value, 0, 1);
    this.visible = this._level > 0;
    this.apply();
  }

  /** A quick flare: the glow swells and the ring grows, then settles. */
  burst(): void {
    this.flare = 1;
  }

  update(dt: number): void {
    this.time += dt;
    this.flare = Math.max(0, this.flare - dt * 1.6);
    this.ring.rotation.z += dt * SPIN * Math.PI * 2 * (1 + this.flare * 2);
    this.apply();
  }

  dispose(): void {
    this.removeFromParent();
    this.dotMaterial.dispose();
    this.bandMaterial.dispose();
    this.glowMaterial.dispose();
  }

  private apply(): void {
    const l = this._level;
    const breathe = 1 + Math.sin(this.time * 3) * 0.06;
    this.dotMaterial.opacity = l * 0.95;
    this.bandMaterial.opacity = l * 0.3;
    this.glowMaterial.opacity = Math.min(1, l * 0.38 * breathe + this.flare * 0.6);
    this.glow.scale.setScalar(1.9 * breathe + this.flare * 1.4);
    this.ring.scale.setScalar(MathUtils.lerp(0.6, 1, l) * (1 + this.flare * 0.35));
  }
}
