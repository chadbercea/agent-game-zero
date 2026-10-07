import { CylinderGeometry, Group, MathUtils, MeshStandardMaterial } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { FACE_CAMERA } from '../../core/grid';
import { solid } from '../../core/mesh';
import { NEUTRAL } from '../../core/palette';

/** The longest the arm gets, from where it comes out to the wrist. */
export const MAX_REACH = 3;
/** From the wrist down to the held thing: a socket just below the curled fingers. */
const PALM_H = 0.3;
const FINGER_H = 0.22;
const SOCKET_BELOW = PALM_H + FINGER_H * 0.55;
/** How far fingers curl at full grip, and the wave's swing. */
const CURL = 1.15;
const WAVE_SWING = 0.45;

/**
 * Hand primitive: a low-poly white hand on a sleeve, the cartoon kind with
 * a chunky palm, four fingers and a thumb, and a graphite cuff. It hangs
 * straight down from where it's attached (e.g. a Cloud's `hand` point) and
 * faces the camera.
 *
 * Rig hooks: `reach` (0–1) extends the arm down, up to MAX_REACH; `grip`
 * (0–1) curls the fingers closed; `wave` (radians) tips the hand side to
 * side from the wrist; `socket` is where a held thing goes (it follows the
 * hand), just below the fingers.
 */
export class Hand extends Group {
  readonly socket = new Group();
  private readonly sleeve;
  private readonly wrist = new Group();
  private readonly fingers: Group[] = [];
  private readonly thumb = new Group();
  private readonly materials: MeshStandardMaterial[];
  private _reach = 0;
  private _grip = 0;
  private _wave = 0;

  constructor() {
    super();
    const skin = new MeshStandardMaterial({ color: NEUTRAL.backdrop, emissive: NEUTRAL.shell, emissiveIntensity: 0.2, roughness: 0.7, flatShading: true });
    const graphite = new MeshStandardMaterial({ color: NEUTRAL.graphite, roughness: 0.55, flatShading: true });
    this.materials = [skin, graphite];
    const turn = new Group();
    turn.rotation.y = FACE_CAMERA;
    this.add(turn);

    // The sleeve: a unit-high cylinder hanging down, stretched to the reach.
    this.sleeve = solid(new CylinderGeometry(0.1, 0.12, 1, 8), skin);
    turn.add(this.sleeve);
    turn.add(this.wrist);

    const cuff = solid(new CylinderGeometry(0.15, 0.15, 0.09, 10), graphite);
    cuff.position.y = -0.02;
    this.wrist.add(cuff);
    const palm = solid(new RoundedBoxGeometry(0.34, PALM_H, 0.15, 2, 0.06), skin);
    palm.position.y = -0.06 - PALM_H / 2;
    this.wrist.add(palm);

    const fingerGeo = new RoundedBoxGeometry(0.075, FINGER_H, 0.09, 2, 0.03);
    [-0.12, -0.04, 0.04, 0.12].forEach((x, i) => {
      // Each finger pivots at the bottom of the palm; the middle two are a touch longer.
      const pivot = new Group();
      pivot.position.set(x, -0.06 - PALM_H, 0);
      const finger = solid(fingerGeo, skin);
      finger.position.y = -FINGER_H / 2;
      finger.scale.y = i === 1 || i === 2 ? 1.08 : 0.94;
      pivot.add(finger);
      this.wrist.add(pivot);
      this.fingers.push(pivot);
    });
    this.thumb.position.set(-0.17, -0.06 - PALM_H * 0.45, 0.02);
    const thumb = solid(new RoundedBoxGeometry(0.08, 0.17, 0.09, 2, 0.03), skin);
    thumb.position.y = -0.08;
    this.thumb.add(thumb);
    this.thumb.rotation.z = -0.55;
    this.wrist.add(this.thumb);

    this.socket.position.set(0, -SOCKET_BELOW, 0.02);
    this.wrist.add(this.socket);
    this.reach = 0;
  }

  /** 0 = tucked away (hidden), 1 = all the way down. */
  get reach(): number {
    return this._reach;
  }

  set reach(value: number) {
    this._reach = MathUtils.clamp(value, 0, 1);
    const length = this._reach * MAX_REACH;
    this.visible = this._reach > 0.001;
    this.sleeve.scale.y = Math.max(0.001, length);
    this.sleeve.position.y = -length / 2;
    this.wrist.position.y = -length;
  }

  /** 0 = open hand, 1 = fingers curled closed (holding). */
  get grip(): number {
    return this._grip;
  }

  set grip(value: number) {
    this._grip = MathUtils.clamp(value, 0, 1);
    // Fingers curl toward the viewer, around whatever is in the socket.
    for (const f of this.fingers) f.rotation.x = this._grip * CURL;
    this.thumb.rotation.x = this._grip * CURL * 0.6;
  }

  /** Tip of the hand from the wrist, side to side (radians; ±WAVE_SWING is a full wave). */
  get wave(): number {
    return this._wave;
  }

  set wave(value: number) {
    this._wave = MathUtils.clamp(value, -WAVE_SWING, WAVE_SWING);
    this.wrist.rotation.z = this._wave;
  }

  /** How far down the held point is right now, from where the hand is attached. */
  get depth(): number {
    return this._reach * MAX_REACH + SOCKET_BELOW;
  }

  dispose(): void {
    this.removeFromParent();
    for (const m of this.materials) m.dispose();
  }
}

/** The wave's full swing, for whoever animates it. */
export const WAVE = WAVE_SWING;
