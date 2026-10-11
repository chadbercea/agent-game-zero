import { BoxGeometry, ExtrudeGeometry, Group, Mesh, MeshStandardMaterial, Shape } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { solid } from '../../core/mesh';
import { NEUTRAL } from '../../core/palette';

/** The big gear's turn, radians per second, at full work. */
const SPIN = 1.1;
/** Seconds to spin up when work starts, and to run down when it stops. */
const SPIN_UP = 0.6;
const SPIN_DOWN = 1.4;

/** Window size, as shares of the face's width and the body's height. */
const WINDOW_WIDE = 0.66;
const WINDOW_HIGH = 0.74;
/** The housing's wall thickness (pad units). */
const WALL = 0.08;
/** How soft the housing's corners and edges are (pad units), in a couple of flat facets. */
const SOFT = 0.03;
/** The chamfer on each window's sides. */
const JAMB = 0.02;
/** How far inside the window the gears' front faces sit, and how thick the gears are. */
const GEAR_IN = 0.035;
const GEAR_THICK = 0.15;
/** Tooth depth; every gear shares it (and its tooth size), so any two mesh. */
const TOOTH = 0.05;
/** Teeth per unit of radius: the same tooth size on every gear. */
const TEETH_PER_RADIUS = 34;
/** The one gray every gear is made of. */
const GEAR_GRAY = NEUTRAL.shellShade;

/**
 * A gear train in a window: the first gear, then each next one meshing with
 * the one before, `angle` radians round from it. `x`/`y` place the first
 * gear (pad units from the window's center).
 */
interface Train {
  x: number;
  y: number;
  radii: number[];
  angles: number[];
}

/**
 * One train per window: two or three big gears, too big for it, side by
 * side and meshing, so the window is full and you see their middles, cropped
 * by the window on every side.
 */
const TRAINS: Train[] = [
  // Their edges stay inside the housing (cropped by its walls, base and lid, never through them).
  { x: -0.35, y: 0.02, radii: [0.2, 0.2, 0.2], angles: [-0.1, 0.1] },
  { x: -0.215, y: -0.01, radii: [0.24, 0.24], angles: [0.04] },
];

/**
 * A permanent system's taller body (SystemNode `permanent`), built as a real
 * housing: open windows on the two faces the camera sees, and inside, real
 * gears (one gray, with depth, lit by the scene like everything else) that
 * churn while the system works and run down when it stops. The gears mesh:
 * tooth counts set their speeds and each starts half a tooth round from its
 * neighbor, so teeth fall between teeth as they turn.
 *
 * It keeps its own time (from the render clock, so it needs no ticking) and
 * only turns while it's on screen. `working` says whether it's working.
 */
export class Gearworks extends Group {
  /** Whether the system is working: the gears spin up, or run down. */
  working = false;
  private speed = 0;
  private angle = 0;
  private last = 0;
  private readonly gears: { mesh: Mesh; ratio: number; phase: number }[] = [];
  private readonly materials: MeshStandardMaterial[];

  /** `width` is the body's width; `bottom`/`top` its height range (all in the pad's units). */
  constructor(width: number, bottom: number, top: number) {
    super();
    const shell = new MeshStandardMaterial({ color: NEUTRAL.shell, roughness: 0.38, metalness: 0.05, flatShading: true });
    const core = new MeshStandardMaterial({ color: NEUTRAL.graphite, roughness: 0.7, metalness: 0.1 });
    const gear = new MeshStandardMaterial({ color: GEAR_GRAY, roughness: 0.4, metalness: 0.35 });
    this.materials = [shell, core, gear];

    // The housing: soft, low-poly. A lid and a base with rounded, faceted edges (their edges are each
    // window's soft lintel and sill), and between them the walls: two pieces cut to the box's own rounded
    // footprint, reaching up into the lid and down into the base, so corners run unbroken and no seam
    // shows. The window sides are chamfered.
    const h = top - bottom;
    const high = h * WINDOW_HIGH;
    const sill = bottom + (h - high) / 2;
    const lintel = sill + high;
    const wide = width * WINDOW_WIDE;
    const half = width / 2;
    const r = Math.min(SOFT, (sill - bottom) / 2 - 1e-3);
    const slab = (y0: number, y1: number) => {
      const part = solid(new RoundedBoxGeometry(width, y1 - y0, width, 2, r), shell);
      part.position.y = (y0 + y1) / 2;
      this.add(part);
    };
    slab(bottom, sill);
    slab(lintel, top);
    for (const outline of wallOutlines(half, wide / 2, WALL, r, JAMB)) {
      const walls = new ExtrudeGeometry(outline, { depth: high + 2 * r, bevelEnabled: false, curveSegments: 2 });
      // Extruded along +z; stand it up (shape x, z → world x, -z), from just inside the base to just inside the lid.
      walls.rotateX(-Math.PI / 2);
      walls.translate(0, sill - r, 0);
      this.add(solid(walls, shell));
    }
    // A dark core behind the gears, so they stand out against it.
    const coreSize = width - WALL - GEAR_IN - GEAR_THICK - 0.04;
    const inner = new Mesh(new BoxGeometry(coreSize, high, coreSize), core);
    inner.position.set(-half + WALL + coreSize / 2, (sill + lintel) / 2, -half + WALL + coreSize / 2);
    this.add(inner);

    // The gears: one train behind each front window, turning about the window's normal.
    const faces = [
      { rotation: Math.PI / 2, x: half, z: 0 },
      { rotation: 0, x: 0, z: half },
    ];
    faces.forEach((face, i) => {
      const window = new Group();
      window.rotation.y = face.rotation;
      window.position.set(face.x, (sill + lintel) / 2, face.z);
      this.add(window);
      const train = TRAINS[i % TRAINS.length];
      let x = train.x;
      let y = train.y;
      let ratio = 1;
      let phase = 0;
      train.radii.forEach((radius, k) => {
        const teeth = Math.round(radius * TEETH_PER_RADIUS);
        if (k > 0) {
          const before = train.radii[k - 1];
          const beforeTeeth = Math.round(before * TEETH_PER_RADIUS);
          const toward = train.angles[k - 1];
          x += Math.cos(toward) * (before + radius - TOOTH);
          y += Math.sin(toward) * (before + radius - TOOTH);
          phase = meshPhase(toward, beforeTeeth, phase, teeth);
          ratio *= -beforeTeeth / teeth;
        }
        const mesh = new Mesh(gearGeometry(radius, teeth), gear);
        mesh.position.set(x, y, -GEAR_IN - GEAR_THICK);
        mesh.rotation.z = phase;
        // Lit by the scene's lights straight in, not left in the housing's shadow.
        mesh.receiveShadow = false;
        window.add(mesh);
        this.gears.push({ mesh, ratio, phase });
      });
    });
    // The first gear drives the clock: it's drawn every frame the node is on screen.
    this.gears[0].mesh.onBeforeRender = () => this.tick();
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
    for (const g of this.gears) g.mesh.rotation.z = this.angle * g.ratio + g.phase;
  }

  dispose(): void {
    this.removeFromParent();
    this.traverse((o) => {
      if (o instanceof Mesh) o.geometry.dispose();
    });
    for (const m of this.materials) m.dispose();
  }
}

/** Where a tooth's center sits in its pitch (see gearGeometry), and the gap's, as shares of the pitch. */
const TOOTH_CENTER = 0.27;
const GAP_CENTER = TOOTH_CENTER + 0.5;

/**
 * The starting turn for a gear (`teeth`) that meshes with one before it
 * (`beforeTeeth`, at `beforePhase`), standing `toward` radians round from it:
 * so the gap between its teeth faces the before gear's tooth on the line
 * between their centers. Turning at the tooth ratio keeps them meshed.
 */
function meshPhase(toward: number, beforeTeeth: number, beforePhase: number, teeth: number): number {
  const beforePitch = (Math.PI * 2) / beforeTeeth;
  const pitch = (Math.PI * 2) / teeth;
  // How far (in pitches) the before gear's nearest tooth is from the line of centers.
  const off = ((toward - beforePhase) / beforePitch - TOOTH_CENTER) % 1;
  // This gear's gap on the line back (toward + π) must be off by the same share, the other way.
  return toward + Math.PI - (GAP_CENTER - off) * pitch;
}

/** A spur gear with depth: `teeth` round a rim, a plain solid face, bevelled so its faces and tooth sides catch the light. */
function gearGeometry(radius: number, teeth: number): ExtrudeGeometry {
  const root = radius - TOOTH;
  const shape = new Shape();
  // Each tooth: a flank up, its flat top, a flank down, the root to the next.
  const pitch = (Math.PI * 2) / teeth;
  for (let t = 0; t < teeth; t++) {
    const a = t * pitch;
    const points: [number, number][] = [
      [a, root],
      [a + pitch * 0.12, radius],
      [a + pitch * 0.42, radius],
      [a + pitch * 0.54, root],
    ];
    for (const [angle, r] of points) {
      if (t === 0 && angle === a) shape.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
      else shape.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
    }
  }
  shape.closePath();
  const bevel = 0.006;
  return new ExtrudeGeometry(shape, {
    depth: GEAR_THICK - 2 * bevel,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: 8,
  });
}

/**
 * The housing's walls in plan (x, and z as -y): the ring between the box's
 * rounded footprint and its hollow, with the two front windows cut out. That
 * leaves two pieces: the front corner between the windows, and the rest
 * (both back walls and the outer side of each window). `half` is the box's
 * half width, `opening` a window's half width, `wall` the thickness, `round`
 * the footprint's corner radius, `jamb` the chamfer at each window side.
 */
function wallOutlines(half: number, opening: number, wall: number, round: number, jamb: number): Shape[] {
  const inner = half - wall;
  // Points are given as (x, z); a Shape stood up by rotateX(-π/2) maps its y to world -z.
  const at = (shape: Shape, x: number, z: number, first = false) => (first ? shape.moveTo(x, -z) : shape.lineTo(x, -z));
  const corner = (shape: Shape, cx: number, cz: number, from: number, to: number) => {
    // A rounded corner in two flat facets (low poly).
    for (let i = 1; i <= 2; i++) {
      const a = from + ((to - from) * i) / 2;
      at(shape, cx + Math.cos(a) * round, cz + Math.sin(a) * round);
    }
  };
  const front = new Shape();
  at(front, half, opening + jamb, true);
  at(front, half, half - round);
  corner(front, half - round, half - round, 0, Math.PI / 2);
  at(front, opening + jamb, half);
  at(front, opening, half - jamb);
  at(front, opening, inner);
  at(front, inner, inner);
  at(front, inner, opening);
  at(front, half - jamb, opening);
  front.closePath();

  const back = new Shape();
  at(back, -opening - jamb, half, true);
  at(back, -half + round, half);
  corner(back, -half + round, half - round, Math.PI / 2, Math.PI);
  at(back, -half, -half + round);
  corner(back, -half + round, -half + round, Math.PI, Math.PI * 1.5);
  at(back, half - round, -half);
  corner(back, half - round, -half + round, Math.PI * 1.5, Math.PI * 2);
  at(back, half, -opening - jamb);
  at(back, half - jamb, -opening);
  at(back, inner, -opening);
  at(back, inner, -inner);
  at(back, -inner, -inner);
  at(back, -inner, inner);
  at(back, -opening, inner);
  at(back, -opening, half - jamb);
  back.closePath();
  return [front, back];
}
