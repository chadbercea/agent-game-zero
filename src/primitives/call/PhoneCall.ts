import { CurvePath, Group, MathUtils, MeshStandardMaterial, QuadraticBezierCurve3, TorusGeometry, TubeGeometry, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { FACE_CAMERA } from '../../core/grid';
import { solid } from '../../core/mesh';
import { NEUTRAL, STATUS_COLOR } from '../../core/palette';

/** Seconds per ring: the arcs pulse out once per ring. */
export const RING_SECONDS = 0.6;
const ARCS = 3;

/**
 * Phone call primitive: an old-school handset, tipped like the phone emoji,
 * with sound arcs beside it. An agent calling another for help.
 *
 * Rig hooks: `ringing` (0–1) shows the arcs, pulsing out from the handset
 * on a loop (`update(dt)` runs it) while the handset jiggles; at 0 the
 * handset is quiet. `opacity` fades the whole thing.
 */
export class PhoneCall extends Group {
  private readonly handset = new Group();
  private readonly arcs: Group[] = [];
  private readonly graphite: MeshStandardMaterial;
  private readonly arcMaterials: MeshStandardMaterial[] = [];
  private _ringing = 0;
  private _opacity = 1;
  private time = 0;

  constructor() {
    super();
    this.graphite = new MeshStandardMaterial({ color: NEUTRAL.graphite, roughness: 0.4, flatShading: true });
    const face = new Group();
    face.rotation.y = FACE_CAMERA;
    this.add(face);
    face.add(this.handset);

    // The handset: earpiece and mouthpiece joined by a curved grip, tipped 40°.
    const cup = new RoundedBoxGeometry(0.16, 0.11, 0.1, 2, 0.04);
    const ear = solid(cup, this.graphite);
    ear.position.set(-0.19, 0.04, 0);
    const mouth = solid(cup, this.graphite);
    mouth.position.set(0.19, 0.04, 0);
    const grip = new CurvePath<Vector3>();
    grip.add(new QuadraticBezierCurve3(new Vector3(-0.19, 0.06, 0), new Vector3(0, 0.2, 0), new Vector3(0.19, 0.06, 0)));
    const handle = solid(new TubeGeometry(grip, 12, 0.045, 6), this.graphite);
    this.handset.add(ear, mouth, handle);
    this.handset.rotation.z = MathUtils.degToRad(-40);

    // Sound arcs on the earpiece side, growing outward.
    for (let i = 0; i < ARCS; i++) {
      const material = new MeshStandardMaterial({
        color: STATUS_COLOR.waiting,
        emissive: STATUS_COLOR.waiting,
        emissiveIntensity: 0.6,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      this.arcMaterials.push(material);
      const arc = new Group();
      const radius = 0.22 + i * 0.11;
      const mesh = solid(new TorusGeometry(radius, 0.022, 6, 16, Math.PI / 2), material);
      mesh.castShadow = false;
      mesh.rotation.z = Math.PI * 0.6;
      arc.add(mesh);
      arc.position.set(-0.12, 0.1, 0);
      face.add(arc);
      this.arcs.push(arc);
    }
  }

  /** 0 = quiet, 1 = ringing. */
  get ringing(): number {
    return this._ringing;
  }

  set ringing(value: number) {
    this._ringing = MathUtils.clamp(value, 0, 1);
    this.apply();
  }

  /** Fade the handset and its arcs (0 = gone, 1 = solid). */
  get opacity(): number {
    return this._opacity;
  }

  set opacity(value: number) {
    this._opacity = MathUtils.clamp(value, 0, 1);
    this.graphite.transparent = this._opacity < 1;
    this.graphite.opacity = this._opacity;
    this.apply();
  }

  update(dt: number): void {
    this.time += dt;
    this.apply();
  }

  dispose(): void {
    this.removeFromParent();
    this.graphite.dispose();
    for (const m of this.arcMaterials) m.dispose();
  }

  private apply(): void {
    const phase = (this.time / RING_SECONDS) % 1;
    this.arcs.forEach((arc, i) => {
      // Each arc lights up in turn, inner to outer, then fades: a ring going out.
      const local = MathUtils.clamp(phase * ARCS - i, 0, 1);
      const pulse = Math.sin(local * Math.PI);
      this.arcMaterials[i].opacity = this._ringing * this._opacity * pulse;
      arc.scale.setScalar(0.9 + local * 0.2);
    });
    // The handset jiggles while it rings.
    this.handset.position.x = this._ringing * Math.sin(this.time * 40) * 0.015;
  }
}
