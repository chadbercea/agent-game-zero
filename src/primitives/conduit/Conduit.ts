import {
  BoxGeometry,
  BufferGeometry,
  Color,
  DoubleSide,
  EdgesGeometry,
  Group,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  LineSegments,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import { GRID } from '../../core/grid';
import { STATUS_COLOR } from '../../core/palette';
import { hashSeed, seededRandom } from '../../core/scatter';
import type { SharedRun } from '../../core/sharedRuns';
import { GRAPH_COLOR } from '../graph/GraphEdge';

/** Glass tint: the graph's blue, lifted toward white. */
const GLASS_COLOR = new Color(GRAPH_COLOR).lerp(new Color('#ffffff'), 0.55);
const HEIGHT = 0.26;
const GLASS_OPACITY = 0.14;
const EDGE_OPACITY = 0.5;
const RIB_REST = 0.12;
const RIB_PEAK = 0.9;
/** The light wave along the ribs: speed (units/s), spacing between pulses, and pulse width. */
const WAVE_SPEED = 2.6;
const WAVE_PERIOD = 2.2;
const WAVE_WIDTH = 0.35;

/**
 * Streams: lanes of short dashes flowing through the glass, each lane at its
 * own height and offset across, its own speed, alternating direction. The
 * dashes carry the system's colors: mostly green (working) and blue (the
 * graph), some yellow (waiting), a little red (stopped).
 */
const STREAM_MIX: readonly [Color, number][] = [
  [STATUS_COLOR.working, 0.42],
  [GRAPH_COLOR, 0.4],
  [STATUS_COLOR.waiting, 0.13],
  [STATUS_COLOR.stopped, 0.05],
];
const LANES_PER_SQUARE = 3;
const DASHES_PER_UNIT = 5;
const STREAM_SPEED = { min: 1.3, max: 2.8 };
const DASH = { length: 0.09, thick: 0.022 };
let dashGeometry: BoxGeometry | undefined;
const dashMatrix = new Matrix4();

/**
 * Conduit primitive: an information highway. A low glass box on the floor
 * enclosing a shared run (see sharedRuns): one grid square wide, or wider
 * when its lines run a lane apart, with square ends on grid lines. Thin ribs
 * stand at every grid square inside it and light up in a running wave along
 * the run, and several streams of colored dashes flow through it (see
 * STREAM_MIX). `level` (0–1) fades the whole thing in and out.
 */
export class Conduit extends Group {
  readonly run: SharedRun;
  private readonly glass: MeshStandardMaterial;
  private readonly edges: LineBasicMaterial;
  private readonly ribs: { material: LineBasicMaterial; at: number }[] = [];
  private readonly disposables: { dispose(): void }[] = [];
  private readonly streams: InstancedMesh;
  private readonly streamMaterial: MeshBasicMaterial;
  /** Per dash: lane height and offset across, speed (signed), and where it starts along the run. */
  private readonly dashes: { y: number; z: number; speed: number; start: number }[] = [];
  private readonly length: number;
  private _level = 0;
  private time = 0;

  constructor(run: SharedRun) {
    super();
    this.run = run;
    const length = run.to - run.from;
    const width = run.high - run.low + GRID;
    // Built along local X; turned onto Z when the run goes that way.
    const mid = (run.from + run.to) / 2;
    const across = (run.low + run.high) / 2;
    if (run.along === 'x') this.position.set(mid, 0, across);
    else {
      this.position.set(across, 0, mid);
      this.rotation.y = -Math.PI / 2;
    }

    const box = new BoxGeometry(length, HEIGHT, width);
    box.translate(0, HEIGHT / 2, 0);
    this.glass = new MeshStandardMaterial({
      color: GLASS_COLOR,
      transparent: true,
      opacity: 0,
      roughness: 0.1,
      metalness: 0,
      depthWrite: false,
      side: DoubleSide,
    });
    const glass = new Mesh(box, this.glass);
    glass.renderOrder = 2;
    this.add(glass);

    const outline = new EdgesGeometry(box);
    this.edges = new LineBasicMaterial({ color: GRAPH_COLOR, transparent: true, opacity: 0, depthWrite: false });
    this.add(new LineSegments(outline, this.edges));

    // Ribs: an upside-down U across the conduit at every grid square inside it.
    const rib = new BufferGeometry().setFromPoints([
      new Vector3(0, 0, -width / 2),
      new Vector3(0, HEIGHT, -width / 2),
      new Vector3(0, HEIGHT, width / 2),
      new Vector3(0, 0, width / 2),
    ]);
    for (let s = GRID; s < length - 1e-6; s += GRID) {
      const material = new LineBasicMaterial({ color: GRAPH_COLOR, transparent: true, opacity: 0, depthWrite: false });
      const line = new Line(rib, material);
      line.position.x = s - length / 2;
      this.add(line);
      this.ribs.push({ material, at: s });
    }
    // Streams through the glass, seeded by where the run is, so the same run always flows the same way.
    this.length = length;
    const random = seededRandom(hashSeed(`${run.along}:${run.from}:${run.to}:${run.low}:${run.high}`));
    const lanes = Math.max(3, Math.round((width / GRID) * LANES_PER_SQUARE));
    for (let lane = 0; lane < lanes; lane++) {
      const z = ((lane + 0.5) / lanes - 0.5) * (width - 0.1);
      const y = 0.05 + random() * (HEIGHT - 0.1);
      const speed = MathUtils.lerp(STREAM_SPEED.min, STREAM_SPEED.max, random()) * (lane % 2 ? -1 : 1);
      const count = Math.max(2, Math.round(length * DASHES_PER_UNIT * (0.6 + random() * 0.8)));
      for (let k = 0; k < count; k++) this.dashes.push({ y, z, speed, start: random() * length });
    }
    this.streamMaterial = new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    this.streams = new InstancedMesh(
      (dashGeometry ??= new BoxGeometry(DASH.length, DASH.thick, DASH.thick)),
      this.streamMaterial,
      this.dashes.length,
    );
    this.streams.frustumCulled = false;
    this.dashes.forEach((_, i) => this.streams.setColorAt(i, pick(random())));
    this.add(this.streams);
    this.placeDashes();

    this.disposables.push(box, outline, rib, this.glass, this.edges, this.streamMaterial, this.streams);
    this.disposables.push(...this.ribs.map((r) => r.material));
    this.visible = false;
  }

  /** How present the conduit is (0–1). */
  get level(): number {
    return this._level;
  }

  set level(value: number) {
    this._level = MathUtils.clamp(value, 0, 1);
    this.visible = this._level > 0.001;
    this.glass.opacity = GLASS_OPACITY * this._level;
    this.edges.opacity = EDGE_OPACITY * this._level;
    this.streamMaterial.opacity = 0.95 * this._level;
    this.paintRibs();
  }

  update(dt: number): void {
    if (!this.visible) return;
    this.time += dt;
    this.paintRibs();
    this.placeDashes();
  }

  /** Each dash flows along its lane and wraps at the ends, shrinking in and out so it never pokes past the glass. */
  private placeDashes(): void {
    const half = this.length / 2;
    this.dashes.forEach(({ y, z, speed, start }, i) => {
      const s = (((start + speed * this.time) % this.length) + this.length) % this.length;
      const edge = Math.min(s, this.length - s);
      const scale = MathUtils.smoothstep(edge, 0, 0.25);
      dashMatrix.makeScale(Math.max(0.001, scale), Math.max(0.001, scale), Math.max(0.001, scale));
      dashMatrix.setPosition(s - half, y, z);
      this.streams.setMatrixAt(i, dashMatrix);
    });
    this.streams.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.removeFromParent();
    for (const d of this.disposables) d.dispose();
  }

  /** Each rib glows as a wave crest passes it, running from the run's start to its end. */
  private paintRibs(): void {
    const head = this.time * WAVE_SPEED;
    for (const { material, at } of this.ribs) {
      const phase = (((head - at) % WAVE_PERIOD) + WAVE_PERIOD) % WAVE_PERIOD;
      const crest = Math.min(phase, WAVE_PERIOD - phase);
      const glow = Math.exp(-((crest / WAVE_WIDTH) ** 2));
      material.opacity = (RIB_REST + (RIB_PEAK - RIB_REST) * glow) * this._level;
    }
  }
}

/** A stream color from the mix, by a 0–1 draw. */
function pick(draw: number): Color {
  let acc = 0;
  for (const [color, share] of STREAM_MIX) {
    acc += share;
    if (draw < acc) return color;
  }
  return STREAM_MIX[0][0];
}
