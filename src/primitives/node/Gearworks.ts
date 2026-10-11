import {
  AlwaysStencilFunc,
  CircleGeometry,
  EqualStencilFunc,
  Group,
  Mesh,
  MeshStandardMaterial,
  Path,
  PlaneGeometry,
  ReplaceStencilOp,
  Shape,
  ShapeGeometry,
} from 'three';
import { NEUTRAL } from '../../core/palette';

/** Stencil value a gear window writes, so its gears draw only inside it (the Inspector's outline uses 1). */
const WINDOW_STENCIL = 2;
/** The big gear's turn, radians per second, at full work. */
const SPIN = 1.1;
/** Seconds to spin up when work starts, and to run down when it stops. */
const SPIN_UP = 0.6;
const SPIN_DOWN = 1.4;

/** Tooth depth (pad units); every gear shares it, so any two can mesh. */
const TOOTH = 0.05;
/** Teeth per unit of radius: the same tooth size on every gear, so meshing gears turn at their real ratio. */
const TEETH_PER_RADIUS = 34;
/** Spokes on every gear. */
const SPOKES = 5;

/**
 * A gear train in a window: the first gear, then each next one meshing with
 * the one before, `angle` radians round from it. `x`/`y` place the first
 * gear (pad units from the window's center); radii in pad units.
 */
interface Train {
  x: number;
  y: number;
  radii: number[];
  angles: number[];
}

/**
 * One train per window: two or three big gears, too big for it, side by
 * side and meshing, so the window is full and you see only their middles
 * (hubs, spokes, the teeth where they meet), cropped on every side, like a
 * glimpse of a much bigger machine.
 */
const TRAINS: Train[] = [
  { x: -0.45, y: 0.03, radii: [0.25, 0.25, 0.25], angles: [-0.13, 0.13] },
  { x: -0.27, y: -0.02, radii: [0.3, 0.3], angles: [0.07] },
];

/**
 * Gear windows for a permanent system's taller body (SystemNode
 * `permanent`): a dark window on each face the camera sees, with large gears
 * inside that churn while the system works and run down when it stops.
 * Each window marks its pixels in the stencil; the gears draw only there,
 * past the body's own surface, so they read as inside the box.
 *
 * It keeps its own time (from the render clock, so it needs no ticking),
 * and only turns while it's on screen. `working` says whether it's working.
 */
export class Gearworks extends Group {
  /** Whether the system is working: the gears spin up, or run down. */
  working = false;
  private speed = 0;
  private angle = 0;
  private last = 0;
  private readonly gears: { mesh: Mesh; ratio: number }[] = [];
  private readonly materials: MeshStandardMaterial[];

  /**
   * `width` is the body's width; `bottom`/`top` its height range (all in the
   * pad's units). Windows go on its +x and +z faces.
   */
  constructor(width: number, bottom: number, top: number) {
    super();
    const pane = new MeshStandardMaterial({
      color: NEUTRAL.graphiteDark,
      roughness: 0.6,
      depthWrite: false,
      stencilWrite: true,
      stencilRef: WINDOW_STENCIL,
      stencilFunc: AlwaysStencilFunc,
      stencilZPass: ReplaceStencilOp,
    });
    // Inside the window: past the body's surface (no depth test), but only on the window's pixels (stencil).
    const inside = { depthTest: false, depthWrite: false, stencilWrite: true, stencilRef: WINDOW_STENCIL, stencilFunc: EqualStencilFunc };
    const gear = new MeshStandardMaterial({ color: NEUTRAL.shellShade, roughness: 0.45, metalness: 0.3, flatShading: true, ...inside });
    const hub = new MeshStandardMaterial({ color: NEUTRAL.graphite, roughness: 0.4, metalness: 0.4, ...inside });
    this.materials = [pane, gear, hub];

    const high = (top - bottom) * 0.62;
    const wide = width * 0.66;
    const faces = [
      { rotation: Math.PI / 2, x: width / 2 + 0.003, z: 0 },
      { rotation: 0, x: 0, z: width / 2 + 0.003 },
    ];
    faces.forEach((face, i) => {
      const window = new Group();
      window.rotation.y = face.rotation;
      window.position.set(face.x, (bottom + top) / 2, face.z);
      const glass = new Mesh(new PlaneGeometry(wide, high), pane);
      glass.renderOrder = 3;
      window.add(glass);
      const train = TRAINS[i % TRAINS.length];
      let x = train.x;
      let y = train.y;
      let ratio = 1;
      train.radii.forEach((radius, k) => {
        if (k > 0) {
          // Meshing with the one before: centers a radius plus a radius apart, less the teeth that interlock.
          const before = train.radii[k - 1];
          const reach = before + radius - TOOTH;
          x += Math.cos(train.angles[k - 1]) * reach;
          y += Math.sin(train.angles[k - 1]) * reach;
          ratio *= -before / radius;
        }
        const teeth = Math.round(radius * TEETH_PER_RADIUS);
        const mesh = new Mesh(gearGeometry(radius, teeth), gear);
        mesh.position.set(x, y, 0.001);
        // Every other gear sits half a tooth round, so its teeth fall between its neighbor's.
        mesh.userData.phase = k % 2 ? Math.PI / teeth : 0;
        mesh.renderOrder = 4;
        const cap = new Mesh(new CircleGeometry(radius * 0.24, 16), hub);
        cap.position.z = 0.001;
        cap.renderOrder = 5;
        mesh.add(cap);
        window.add(mesh);
        this.gears.push({ mesh, ratio });
      });
      // The glass drives the clock: it's drawn every frame the node is on screen.
      if (i === 0) glass.onBeforeRender = () => this.tick();
      this.add(window);
    });
  }

  private tick(): void {
    const now = performance.now() / 1000;
    const dt = this.last ? Math.min(now - this.last, 0.1) : 0;
    this.last = now;
    if (dt === 0) return;
    const target = this.working ? 1 : 0;
    const rate = dt / (target > this.speed ? SPIN_UP : SPIN_DOWN);
    this.speed = target > this.speed ? Math.min(target, this.speed + rate) : Math.max(target, this.speed - rate);
    this.angle += SPIN * this.speed * dt;
    for (const g of this.gears) g.mesh.rotation.z = this.angle * g.ratio + g.mesh.userData.phase;
  }

  dispose(): void {
    this.removeFromParent();
    this.traverse((o) => {
      if (o instanceof Mesh) o.geometry.dispose();
    });
    for (const m of this.materials) m.dispose();
  }
}

/** A flat spur gear (seen face on, through glass): `teeth` round a rim, spokes out from a bored hub. */
function gearGeometry(radius: number, teeth: number): ShapeGeometry {
  const root = radius - TOOTH;
  const shape = new Shape();
  // Each tooth: a flank up, its flat top, a flank down, the root between teeth (tops a little narrower than roots).
  const per = (Math.PI * 2) / teeth;
  for (let t = 0; t < teeth; t++) {
    const a = t * per;
    const points: [number, number][] = [
      [a, root],
      [a + per * 0.12, radius],
      [a + per * 0.42, radius],
      [a + per * 0.54, root],
    ];
    for (const [angle, r] of points) {
      if (t === 0 && angle === a) shape.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
      else shape.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
    }
  }
  shape.closePath();
  shape.holes.push(new Path().absarc(0, 0, radius * 0.1, 0, Math.PI * 2, true));
  // Spokes: the rim joined to the hub by SPOKES arms, open between them.
  const hub = radius * 0.3;
  const rim = root * 0.8;
  const arm = 0.21; // half an arm's width, as a share of the turn between spokes
  for (let k = 0; k < SPOKES; k++) {
    const a0 = ((k + arm) / SPOKES) * Math.PI * 2;
    const a1 = ((k + 1 - arm) / SPOKES) * Math.PI * 2;
    const hole = new Path();
    hole.absarc(0, 0, rim, a0, a1, false);
    hole.absarc(0, 0, hub, a1, a0, true);
    shape.holes.push(hole);
  }
  return new ShapeGeometry(shape, 8);
}
