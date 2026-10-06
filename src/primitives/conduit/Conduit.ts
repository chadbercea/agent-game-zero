import {
  BoxGeometry,
  BufferGeometry,
  Color,
  DoubleSide,
  EdgesGeometry,
  Group,
  Line,
  LineBasicMaterial,
  LineSegments,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import { GRID } from '../../core/grid';
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
 * Conduit primitive: an information highway. A low glass box on the floor
 * enclosing a shared run (see sharedRuns): one grid square wide, or wider
 * when its lines run a lane apart, with square ends on grid lines. Thin ribs
 * stand at every grid square inside it and light up in a running wave along
 * the run. `level` (0–1) fades the whole thing in and out.
 */
export class Conduit extends Group {
  readonly run: SharedRun;
  private readonly glass: MeshStandardMaterial;
  private readonly edges: LineBasicMaterial;
  private readonly ribs: { material: LineBasicMaterial; at: number }[] = [];
  private readonly disposables: { dispose(): void }[] = [];
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
    this.disposables.push(box, outline, rib, this.glass, this.edges, ...this.ribs.map((r) => r.material));
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
    this.paintRibs();
  }

  update(dt: number): void {
    if (!this.visible) return;
    this.time += dt;
    this.paintRibs();
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
