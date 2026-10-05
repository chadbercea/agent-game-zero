import {
  BoxGeometry,
  type Color,
  Group,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { at, solid } from '../../core/mesh';
import { NEUTRAL } from '../../core/palette';
import { radialGlowTexture } from '../../core/textures';

export const PAD_TOP = 0.28;
export const SCREEN_WIDTH = 0.46;
export const SCREEN_DEPTH = 0.3;
export const SCREEN_GLOW = 1.6;
export const SKIRT_GLOW = 1.3;
export const FLOOR_GLOW_OPACITY = 0.42;

let shared: ReturnType<typeof buildGeometry> | undefined;

function buildGeometry() {
  const floorGlow = new PlaneGeometry(3.4, 3.4);
  floorGlow.rotateX(-Math.PI / 2);
  const screen = new PlaneGeometry(SCREEN_WIDTH, SCREEN_DEPTH);
  screen.rotateX(-Math.PI / 2);
  return {
    slab: new RoundedBoxGeometry(1.5, 0.24, 1.1, 3, 0.07),
    skirt: new RoundedBoxGeometry(1.46, 0.05, 1.06, 2, 0.024),
    bezel: new BoxGeometry(0.62, 0.02, 0.44),
    screen,
    floorGlow,
  };
}

/**
 * Pad primitive: the rounded white slab with a lit screen on top, a glowing
 * bottom edge, and a soft glow on the floor. Tasks and gates are built on it;
 * whoever owns the pad decides what color it shows and animates its lights.
 */
export class Pad extends Group {
  readonly screenMaterial: MeshStandardMaterial;
  readonly skirtMaterial: MeshStandardMaterial;
  readonly glowMaterial: MeshBasicMaterial;
  private readonly materials: Material[];

  constructor() {
    super();
    const g = (shared ??= buildGeometry());
    const shell = new MeshStandardMaterial({ color: NEUTRAL.shell, roughness: 0.38, metalness: 0.05 });
    const bezel = new MeshStandardMaterial({ color: NEUTRAL.graphite, roughness: 0.4, metalness: 0.2 });
    this.screenMaterial = new MeshStandardMaterial({ color: 0x111111, roughness: 0.3 });
    this.skirtMaterial = new MeshStandardMaterial({ color: 0x111111, roughness: 0.3 });
    this.glowMaterial = new MeshBasicMaterial({
      map: radialGlowTexture(),
      transparent: true,
      depthWrite: false,
      opacity: FLOOR_GLOW_OPACITY,
    });
    this.materials = [shell, bezel, this.screenMaterial, this.skirtMaterial, this.glowMaterial];

    // Floor glow sits just above the shadow catcher.
    const glow = new Mesh(g.floorGlow, this.glowMaterial);
    glow.position.y = 0.006;
    glow.renderOrder = -1;
    this.add(glow);
    this.add(at(new Mesh(g.skirt, this.skirtMaterial), 0.035));
    this.add(at(solid(g.slab, shell), 0.16));
    this.add(at(solid(g.bezel, bezel), PAD_TOP + 0.002));
    this.add(at(new Mesh(g.screen, this.screenMaterial), PAD_TOP + 0.014));
  }

  /** Light the screen, edge and floor glow in `color`; `null` turns them off (dark screen, no glow). */
  setColor(color: Color | null): void {
    if (!color) {
      this.screenMaterial.emissive.setRGB(0, 0, 0);
      this.skirtMaterial.emissive.setRGB(0, 0, 0);
      this.glowMaterial.visible = false;
      return;
    }
    this.screenMaterial.emissive.copy(color);
    this.screenMaterial.emissiveIntensity = SCREEN_GLOW;
    this.skirtMaterial.emissive.copy(color);
    this.skirtMaterial.emissiveIntensity = SKIRT_GLOW;
    this.glowMaterial.color.copy(color);
    this.glowMaterial.visible = true;
  }

  dispose(): void {
    this.removeFromParent();
    for (const m of this.materials) m.dispose();
  }
}
