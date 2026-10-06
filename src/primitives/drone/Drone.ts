import {
  DoubleSide,
  Group,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Sprite,
  SpriteMaterial,
} from 'three';
import type { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { makeLabel } from '../../core/label';
import { LINEAGE, type Lineage, NEUTRAL, STATUS_COLOR, type Status } from '../../core/palette';
import { at, solid } from '../../core/mesh';
import { radialGlowTexture } from '../../core/textures';
import { ARM_REACH, droneGeometry, NOSE_LEAN, NOSE_Y, NOSE_Z } from './geometry';

export interface DroneOptions {
  name?: string;
  lineage?: Lineage;
  status?: Status;
  /** Sub-agents share the lineage palette on a smaller body. */
  subAgent?: boolean;
  showLabel?: boolean;
}

/** One articulated appendage: shoulder pivot → strut → motor pod → rotor. */
export interface DroneArm {
  pivot: Group;
  pod: Group;
  rotor: Group;
  /** Yaw of the arm around the body, radians. */
  yaw: number;
}

/** Animation hooks. Animators write to these; the primitive never animates itself. */
export interface DroneRig {
  /** Moves as a unit above the drone's floor anchor (hover, sag, shake). */
  hover: Group;
  /** Inside hover: leans the whole craft into its direction of travel (flight). */
  tilt: Group;
  /** Shell + lens; tilts independently of the arms. */
  body: Group;
  arms: DroneArm[];
  ringMaterial: MeshStandardMaterial;
  /** Soft status-colored haze around the lens. */
  haloMaterial: SpriteMaterial;
  accentMaterial: MeshStandardMaterial;
  blurMaterial: MeshBasicMaterial;
  bladeMaterial: MeshStandardMaterial;
}

export const HOVER_HEIGHT = 2.1;
export const SUB_AGENT_SCALE = 0.58;

/** Emissive strength of the status ring and lineage accents. */
export const RING_GLOW = 1.8;
const ACCENT_GLOW = 1.5;
export const HALO_OPACITY = 0.45;

/**
 * Drone primitive. Its origin sits on the floor directly beneath it, which is
 * on whatever it stands over (a gate or node); the body hovers above at HOVER_HEIGHT.
 *
 * Front of the drone (the lens) faces local +Z.
 */
export class Drone extends Group {
  readonly rig: DroneRig;
  readonly subAgent: boolean;

  private _status: Status;
  private _lineage: Lineage;
  private readonly label?: CSS2DObject;
  private readonly materials: Material[] = [];
  /** Each material's own opacity, so fading can scale it back down from there. */
  private readonly baseOpacity = new Map<Material, number>();
  private _fade = 1;
  /**
   * A brief acknowledgement (0–1), e.g. when work is delivered to this drone.
   * DroneAnimator brightens the ring and lifts the drone slightly, then decays it.
   */
  flash = 0;

  constructor(options: DroneOptions = {}) {
    super();
    const { name = 'D3V1N', lineage = 'blue', status = 'waiting', subAgent = false, showLabel = false } = options;
    this.name = name;
    this.subAgent = subAgent;
    this._status = status;
    this._lineage = lineage;

    const g = droneGeometry();

    const shell = this.track(
      new MeshStandardMaterial({ color: NEUTRAL.shell, roughness: 0.42, metalness: 0, flatShading: true }),
    );
    const graphite = this.track(
      new MeshStandardMaterial({ color: NEUTRAL.graphite, roughness: 0.5, metalness: 0.25, flatShading: true }),
    );
    const bezel = this.track(
      new MeshStandardMaterial({ color: NEUTRAL.graphiteDark, roughness: 0.35, metalness: 0.3, flatShading: true }),
    );
    const glass = this.track(new MeshStandardMaterial({ color: NEUTRAL.glass, roughness: 0.25, metalness: 0.2 }));
    const ringMaterial = this.track(new MeshStandardMaterial({ color: 0x111111, roughness: 0.3 }));
    const accentMaterial = this.track(new MeshStandardMaterial({ color: 0x111111, roughness: 0.3 }));
    const bladeMaterial = this.track(
      new MeshStandardMaterial({ color: NEUTRAL.graphite, roughness: 0.5, transparent: true }),
    );
    const blurMaterial = this.track(
      new MeshBasicMaterial({
        color: NEUTRAL.graphiteDark,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    const rimMaterial = this.track(
      new MeshBasicMaterial({ color: NEUTRAL.graphiteDark, transparent: true, opacity: 0.16, depthWrite: false, side: DoubleSide }),
    );

    const hover = new Group();
    hover.name = 'hover';
    hover.position.y = HOVER_HEIGHT;
    this.add(hover);
    const tilt = new Group();
    tilt.name = 'tilt';
    hover.add(tilt);

    // Body: shell + forward-facing lens.
    const body = new Group();
    body.name = 'body';
    tilt.add(body);
    body.add(solid(g.shell, shell));
    // Lens sits flush on the hull's raked nose face, which tips up toward an overhead viewer.
    const lens = new Group();
    lens.position.set(0, NOSE_Y, NOSE_Z - 0.01);
    lens.rotation.x = -Math.atan(NOSE_LEAN); // tip up to sit flush on the raked nose
    lens.scale.setScalar(0.72);
    lens.add(solid(g.lensHousing, bezel));
    const glassMesh = solid(g.lensGlass, glass);
    glassMesh.position.z = 0.062;
    const ring = solid(g.lensRing, ringMaterial);
    ring.position.z = 0.068;
    const halo = new Sprite(
      this.track(new SpriteMaterial({ map: radialGlowTexture(), transparent: true, depthWrite: false, opacity: HALO_OPACITY })),
    );
    halo.scale.setScalar(1.1);
    halo.position.z = 0.12;
    lens.add(glassMesh, ring, halo);
    body.add(lens);

    // Four arms on the diagonals; geometry runs along +X, so yaw rotates it into place.
    const arms: DroneArm[] = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4].map((yaw) => {
      const pivot = new Group();
      pivot.name = 'arm';
      pivot.position.y = -0.06;
      pivot.rotation.y = yaw;
      pivot.add(solid(g.arm, graphite), solid(g.shoulder, bezel));

      const pod = new Group();
      pod.position.x = ARM_REACH;
      // Counter the arm yaw so pods (and their feet) stay square to the body.
      pod.rotation.y = -yaw;
      pod.add(solid(g.knuckle, graphite));
      pod.add(at(solid(g.motorCap, shell), 0.1));
      pod.add(at(solid(g.motorBand, graphite), 0.03));
      pod.add(at(solid(g.foot, shell), -0.07));
      pod.add(at(new Mesh(g.footAccent, accentMaterial), -0.1));

      const rotor = new Group();
      rotor.name = 'rotor';
      rotor.position.y = 0.2;
      rotor.add(solid(g.rotorHub, graphite));
      const blade = new Mesh(g.rotorBlade, bladeMaterial);
      blade.castShadow = true;
      rotor.add(blade);
      const blur = new Mesh(g.rotorBlur, blurMaterial);
      const rim = new Mesh(g.rotorRim, rimMaterial);
      rim.position.y = 0.001;
      rotor.add(blur, rim);
      pod.add(rotor);

      pivot.add(pod);
      tilt.add(pivot);
      return { pivot, pod, rotor, yaw };
    });

    this.rig = { hover, tilt, body, arms, ringMaterial, haloMaterial: halo.material, accentMaterial, blurMaterial, bladeMaterial };

    if (showLabel) {
      this.label = makeLabel(name);
      this.label.position.y = HOVER_HEIGHT + 0.85;
      this.add(this.label);
    }

    if (subAgent) this.scale.setScalar(SUB_AGENT_SCALE);

    this.applyStatus();
    this.applyLineage();
  }

  get status(): Status {
    return this._status;
  }

  set status(value: Status) {
    if (value === this._status) return;
    this._status = value;
    this.applyStatus();
  }

  get lineage(): Lineage {
    return this._lineage;
  }

  set lineage(value: Lineage) {
    this._lineage = value;
    this.applyLineage();
  }

  /**
   * Overall visibility (0–1) for dissolving in or out at full size. Static
   * materials fade here; DroneAnimator scales the ones it animates by it.
   */
  get fade(): number {
    return this._fade;
  }

  set fade(value: number) {
    this._fade = Math.min(1, Math.max(0, value));
    const animated = new Set<Material>([this.rig.blurMaterial, this.rig.bladeMaterial, this.rig.haloMaterial]);
    for (const m of this.materials) {
      if (animated.has(m)) continue;
      if (!this.baseOpacity.has(m)) this.baseOpacity.set(m, m.opacity);
      m.transparent = this._fade < 1 || this.baseOpacity.get(m)! < 1 || m.transparent;
      m.opacity = this.baseOpacity.get(m)! * this._fade;
    }
    if (this.label) this.label.element.style.opacity = String(this._fade);
    this.traverse((o) => (o.castShadow = this._fade > 0.5));
  }

  set labelVisible(visible: boolean) {
    if (this.label) this.label.visible = visible;
  }

  dispose(): void {
    this.removeFromParent();
    this.label?.element.remove();
    for (const m of this.materials) m.dispose();
  }

  private applyStatus(): void {
    const ring = this.rig.ringMaterial;
    ring.emissive.copy(STATUS_COLOR[this._status]);
    ring.emissiveIntensity = RING_GLOW;
    this.rig.haloMaterial.color.copy(STATUS_COLOR[this._status]);
  }

  private applyLineage(): void {
    const accent = this.rig.accentMaterial;
    accent.emissive.copy(LINEAGE[this._lineage]);
    accent.emissiveIntensity = ACCENT_GLOW;
  }

  private track<M extends Material>(material: M): M {
    this.materials.push(material);
    return material;
  }
}
