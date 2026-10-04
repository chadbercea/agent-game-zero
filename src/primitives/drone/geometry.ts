import {
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  RingGeometry,
  TorusGeometry,
  Vector3,
} from 'three';

/**
 * Drone geometry, shared by every drone instance. Units: the shell is roughly
 * 1.1 wide; rotor tips reach ~1.35 from center.
 */
export interface DroneGeometry {
  shell: BufferGeometry;
  lensHousing: BufferGeometry;
  lensGlass: BufferGeometry;
  lensRing: BufferGeometry;
  arm: BufferGeometry;
  shoulder: BufferGeometry;
  knuckle: BufferGeometry;
  motorCap: BufferGeometry;
  motorBand: BufferGeometry;
  foot: BufferGeometry;
  footAccent: BufferGeometry;
  rotorHub: BufferGeometry;
  rotorBlade: BufferGeometry;
  rotorBlur: BufferGeometry;
  rotorRim: BufferGeometry;
}

export const ARM_REACH = 0.92;
export const ROTOR_RADIUS = 0.33;

let cache: DroneGeometry | undefined;

export function droneGeometry(): DroneGeometry {
  return (cache ??= build());
}

function build(): DroneGeometry {
  const shell = hull(HULL_SECTIONS);

  // Octagonal camera bezel facing +Z, flat edge on top.
  const lensHousing = new CylinderGeometry(0.29, 0.33, 0.12, 8, 1);
  lensHousing.rotateY(Math.PI / 8);
  lensHousing.rotateX(Math.PI / 2);

  const lensGlass = new CircleGeometry(0.21, 32);
  const lensRing = new TorusGeometry(0.155, 0.026, 10, 48);

  // Arm strut runs along +X from the shoulder pivot.
  const arm = new BoxGeometry(ARM_REACH - 0.28, 0.07, 0.1);
  arm.translate((ARM_REACH - 0.28) / 2 + 0.28, 0, 0);

  // Dark sleeve where each arm leaves the hull.
  const shoulder = new BoxGeometry(0.2, 0.12, 0.15);
  shoulder.translate(0.46, 0, 0);

  const knuckle = new BoxGeometry(0.16, 0.12, 0.15);

  const motorCap = new CylinderGeometry(0.105, 0.12, 0.13, 10);
  const motorBand = new CylinderGeometry(0.124, 0.124, 0.045, 10);
  const foot = new CylinderGeometry(0.125, 0.11, 0.05, 10);
  const footAccent = new CylinderGeometry(0.112, 0.112, 0.018, 10);

  const rotorHub = new CylinderGeometry(0.04, 0.045, 0.06, 8);
  const rotorBlade = new BoxGeometry(ROTOR_RADIUS * 2, 0.012, 0.065);
  const rotorBlur = new CircleGeometry(ROTOR_RADIUS, 40);
  rotorBlur.rotateX(-Math.PI / 2);
  const rotorRim = new RingGeometry(ROTOR_RADIUS - 0.03, ROTOR_RADIUS, 48);
  rotorRim.rotateX(-Math.PI / 2);

  return {
    shell,
    lensHousing,
    lensGlass,
    lensRing,
    arm,
    shoulder,
    knuckle,
    motorCap,
    motorBand,
    foot,
    footAccent,
    rotorHub,
    rotorBlade,
    rotorBlur,
    rotorRim,
  };
}

/**
 * One cross-section of the hull: a chamfered octagon at depth `z` (+Z is the
 * nose). `lean` tilts the section back with height (dz per unit y), which is
 * how the nose gets its raked, lens-carrying face.
 */
interface HullSection {
  z: number;
  width: number;
  height: number;
  y: number;
  /** Chamfer on the top and bottom corners, as a fraction of the smaller side. */
  chamferTop: number;
  chamferBottom: number;
  lean?: number;
  /** Raises a spine along the top centerline, splitting the roof into two planes. */
  ridge?: number;
}

/**
 * Nose → tail. Widest just behind the nose, then sweeping and rising into a
 * narrow tail: a faceted, aerodynamic pod rather than a ball.
 */
const HULL_SECTIONS: HullSection[] = [
  { z: 0.54, width: 0.58, height: 0.5, y: -0.04, chamferTop: 0.24, chamferBottom: 0.2, lean: 0.45, ridge: 0.02 },
  { z: 0.4, width: 0.75, height: 0.62, y: -0.01, chamferTop: 0.32, chamferBottom: 0.26, lean: 0.2, ridge: 0.06 },
  { z: 0.02, width: 0.8, height: 0.6, y: 0.02, chamferTop: 0.38, chamferBottom: 0.3, ridge: 0.08 },
  { z: -0.38, width: 0.62, height: 0.44, y: 0.05, chamferTop: 0.38, chamferBottom: 0.3, ridge: 0.06 },
  { z: -0.66, width: 0.3, height: 0.2, y: 0.07, chamferTop: 0.3, chamferBottom: 0.3, ridge: 0.02 },
];

/** Slope of the nose face; the lens is mounted flush to it. */
export const NOSE_LEAN = HULL_SECTIONS[0].lean!;
export const NOSE_Z = HULL_SECTIONS[0].z;
export const NOSE_Y = HULL_SECTIONS[0].y;

function sectionRing({ z, width, height, y, chamferTop, chamferBottom, lean = 0, ridge = 0 }: HullSection): Vector3[] {
  const w = width / 2;
  const h = height / 2;
  const ct = Math.min(width, height) * chamferTop;
  const cb = Math.min(width, height) * chamferBottom;
  // Every section has the same vertex count so neighbouring rings stitch cleanly.
  const outline: [number, number][] = [
    [w - ct, h], [0, h + ridge], [-(w - ct), h], [-w, h - ct], [-w, -(h - cb)],
    [-(w - cb), -h], [w - cb, -h], [w, -(h - cb)], [w, h - ct],
  ];
  return outline.map(([x, dy]) => new Vector3(x, y + dy, z - dy * lean));
}

/** Loft cross-sections into a closed, flat-faceted hull with capped ends. */
function hull(sections: HullSection[]): BufferGeometry {
  const rings = sections.map(sectionRing);
  const center = new Vector3();
  rings.flat().forEach((v) => center.add(v));
  center.divideScalar(rings.flat().length);

  const positions: number[] = [];
  const normal = new Vector3();
  const mid = new Vector3();
  const tri = (a: Vector3, b: Vector3, c: Vector3) => {
    // Wind every face outward so front-face culling and shadows behave.
    normal.subVectors(b, a).cross(new Vector3().subVectors(c, a));
    mid.copy(a).add(b).add(c).divideScalar(3).sub(center);
    const [p, q] = normal.dot(mid) >= 0 ? [b, c] : [c, b];
    positions.push(a.x, a.y, a.z, p.x, p.y, p.z, q.x, q.y, q.z);
  };

  for (let r = 0; r < rings.length - 1; r++) {
    const front = rings[r];
    const back = rings[r + 1];
    for (let i = 0; i < front.length; i++) {
      const j = (i + 1) % front.length;
      tri(front[i], front[j], back[j]);
      tri(front[i], back[j], back[i]);
    }
  }
  for (const ring of [rings[0], rings[rings.length - 1]]) {
    const hub = ring.reduce((sum, v) => sum.add(v), new Vector3()).divideScalar(ring.length);
    for (let i = 0; i < ring.length; i++) tri(hub, ring[i], ring[(i + 1) % ring.length]);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}
