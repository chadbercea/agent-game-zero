import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  type Material,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  QuadraticBezierCurve3,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import { FACE_CAMERA } from '../../core/grid';
import { at, solid } from '../../core/mesh';
import { NEUTRAL, STATUS_COLOR } from '../../core/palette';
import type { JobKind } from '../node/emblems';
import { productGeometry, productMaterial } from '../product/Product';

/** What each system's job is, in words (labels, logs). */
export const JOB_TITLE: Record<JobKind, string> = {
  figma: 'Reference the design → write a report',
  github: 'Create a branch → git init',
  bitbucket: 'Create a branch → git init',
  notion: 'Read the PRD',
};

/** Where the work product floats when a job completes: beside the work, clear of the sub-agent above. */
export const PRODUCT_OFFSET = { x: 0.42, y: 0.55, z: 0.12 } as const;

/**
 * Job primitive: the visible work a sub-agent does at a system node. `progress`
 * (0–1) builds the job's visual; at 1 the work product (the old work cube)
 * appears, ready to be carried home. Each system has its own visual:
 * - Figma: a mini design window: a rectangle traces itself, fills, and gets selected
 * - GitHub and Bitbucket: a git graph grows and forks, then an init folder appears
 * - Notion: pages stack up, one after another
 */
export class Job extends Group {
  readonly kind: JobKind;
  /** The work product: appears when the job completes; carried home on return. */
  readonly product: Mesh;
  private _progress = 0;
  private time = 0;
  private readonly materials: Material[] = [];
  private readonly build: (progress: number, time: number) => void;

  constructor(kind: JobKind) {
    super();
    this.kind = kind;
    this.name = `job:${kind}`;
    const shell = this.track(new MeshStandardMaterial({ color: NEUTRAL.shell, roughness: 0.4, flatShading: true }));
    const graphite = this.track(new MeshStandardMaterial({ color: NEUTRAL.graphite, roughness: 0.45, flatShading: true }));
    const lit = this.track(
      new MeshStandardMaterial({ color: STATUS_COLOR.working, emissive: STATUS_COLOR.working, emissiveIntensity: 0.6 }),
    );

    if (kind === 'figma') this.build = this.buildWindow(lit);
    else if (kind === 'github' || kind === 'bitbucket') this.build = this.buildBranch(shell, graphite);
    else this.build = this.buildReport(shell, graphite);

    // The job's work product: its system's product shape (see Product), facing the camera.
    this.product = solid(productGeometry(kind), this.track(productMaterial()));
    this.product.rotation.y = FACE_CAMERA;
    this.product.position.set(PRODUCT_OFFSET.x, PRODUCT_OFFSET.y, PRODUCT_OFFSET.z);
    this.product.visible = false;
    this.add(this.product);

    this.progress = 0;
  }

  get progress(): number {
    return this._progress;
  }

  set progress(value: number) {
    this._progress = MathUtils.clamp(value, 0, 1);
    this.build(this._progress, this.time);
    // The work product pops in over the last few percent.
    const pop = MathUtils.clamp((this._progress - 0.92) / 0.08, 0, 1);
    this.product.visible = pop > 0;
    this.product.scale.setScalar(Math.max(0.001, pop));
  }

  /** Idle motion (scan bars, product spin). Progress is set by whoever runs the job. */
  update(dt: number): void {
    this.time += dt;
    this.build(this._progress, this.time);
    if (this.product.visible) this.product.rotation.y += dt * 0.8;
  }

  dispose(): void {
    this.removeFromParent();
    this.traverse((o) => {
      if (o instanceof Mesh) o.geometry.dispose();
    });
    for (const m of this.materials) m.dispose();
  }

  /** Notion: up to five pages settle onto a stack, each ruled with lines of text. */
  private buildReport(shell: Material, graphite: Material) {
    const SHEETS = 5;
    const sheets = Array.from({ length: SHEETS }, (_, i) => {
      const sheet = new Group();
      sheet.add(solid(new BoxGeometry(0.42, 0.018, 0.52), shell));
      for (let l = 0; l < 4; l++) {
        const line = at(solid(new BoxGeometry(l === 3 ? 0.16 : 0.28, 0.004, 0.03), graphite), 0.011);
        line.position.set(-0.04 + (l === 3 ? -0.06 : 0), 0.011, -0.15 + l * 0.1);
        sheet.add(line);
      }
      sheet.rotation.y = (i - 2) * 0.06;
      this.add(sheet);
      return sheet;
    });
    return (progress: number) => {
      sheets.forEach((sheet, i) => {
        // Each sheet drops onto the stack during its slice of the progress.
        const t = MathUtils.clamp(progress * SHEETS - i, 0, 1);
        sheet.visible = t > 0;
        sheet.position.y = 0.24 + i * 0.024 + (1 - easeOut(t)) * 0.35;
      });
    };
  }

  /** GitHub: a trunk grows with commits, a branch forks off it, then a folder (git init) appears. */
  private buildBranch(shell: Material, graphite: Material) {
    const graph = new Group();
    graph.position.y = 0.3;
    this.add(graph);
    const trunk = solid(new CylinderGeometry(0.03, 0.03, 1, 8), graphite);
    graph.add(trunk);
    const commitGeometry = new SphereGeometry(0.06, 12, 8);
    const commits = [0.1, 0.38, 0.62].map((y) => at(solid(commitGeometry, shell), y));
    graph.add(...commits);
    const forkCurve = new QuadraticBezierCurve3(new Vector3(0, 0.3, 0), new Vector3(0.24, 0.36, 0), new Vector3(0.24, 0.62, 0));
    const forkGeometry = new TubeGeometry(forkCurve, 16, 0.028, 6);
    const fork = solid(forkGeometry, graphite);
    graph.add(fork);
    const forkTip = solid(commitGeometry, shell);
    graph.add(forkTip);
    const folder = new Group();
    folder.add(solid(new BoxGeometry(0.34, 0.2, 0.24), shell));
    const tab = at(solid(new BoxGeometry(0.13, 0.05, 0.24), shell), 0.12);
    tab.position.x = -0.1;
    folder.add(tab);
    folder.position.set(-0.3, 0.34, 0.1);
    this.add(folder);
    const forkIndices = forkGeometry.index!.count;

    return (progress: number) => {
      // 0–0.45: trunk grows, committing as it goes.
      const grow = MathUtils.clamp(progress / 0.45, 0, 1);
      const height = Math.max(0.001, grow * 0.72);
      trunk.scale.y = height;
      trunk.position.y = height / 2;
      commits.forEach((c) => (c.visible = c.position.y <= height));
      // 0.45–0.75: the branch forks off.
      const branch = MathUtils.clamp((progress - 0.45) / 0.3, 0, 1);
      fork.visible = branch > 0;
      forkGeometry.setDrawRange(0, Math.floor((forkIndices * branch) / 3) * 3);
      forkTip.visible = branch >= 1;
      forkTip.position.set(0.24, 0.62, 0);
      // 0.75–0.92: git init, a folder pops in.
      const init = MathUtils.clamp((progress - 0.75) / 0.17, 0, 1);
      folder.visible = init > 0;
      folder.scale.setScalar(Math.max(0.001, easeOut(init)));
    };
  }

  /**
   * Figma: an abstracted mini design window. The frame stands up, a toolbar
   * and a layers sidebar slide in, a rectangle traces itself on the canvas
   * edge by edge and fills, then selection handles and a new layer row light up.
   */
  private buildWindow(lit: Material) {
    // Flat, unlit panels: it should read as a crisp little UI, not a lit object.
    const canvas = this.track(new MeshBasicMaterial({ color: '#f6f7f9' }));
    const panel = this.track(new MeshBasicMaterial({ color: '#dcdee3' }));
    const ink = this.track(new MeshBasicMaterial({ color: NEUTRAL.graphite }));
    const fillColor = this.track(new MeshBasicMaterial({ color: '#c3c6cd' }));
    const W = 0.66;
    const H = 0.46;
    const BAR = 0.055;
    const SIDE = 0.15;
    const T = 0.014;

    const win = new Group();
    win.position.y = 0.74;
    this.add(win);
    win.add(solid(new BoxGeometry(W, H, 0.025), canvas));
    const toolbar = solid(new BoxGeometry(W, BAR, 0.03), ink);
    toolbar.position.set(0, H / 2 - BAR / 2, 0.004);
    win.add(toolbar);
    const sidebar = solid(new BoxGeometry(SIDE, H - BAR, 0.03), panel);
    sidebar.position.set(-W / 2 + SIDE / 2, -BAR / 2, 0.004);
    win.add(sidebar);
    const rows = [0, 1, 2].map((i) => {
      const row = solid(new BoxGeometry(SIDE * 0.66, 0.02, 0.012), i === 2 ? lit : ink);
      row.position.set(-W / 2 + SIDE / 2, H / 2 - BAR - 0.05 - i * 0.05, 0.024);
      win.add(row);
      return row;
    });

    // The canvas is the area right of the sidebar and below the toolbar.
    const cx = (-W / 2 + SIDE + W / 2) / 2;
    const cy = -BAR / 2;
    const rw = 0.26;
    const rh = 0.18;
    const z = 0.024;
    // Edges grow from their start corner, clockwise from the top-left.
    const edge = (w: number, h: number, ox: number, oy: number, x: number, y: number) => {
      const g = new BoxGeometry(w, h, T);
      g.translate(ox, oy, 0);
      const m = solid(g, ink);
      m.position.set(x, y, z);
      win.add(m);
      return m;
    };
    const edges = [
      { mesh: edge(rw, T, rw / 2, 0, cx - rw / 2, cy + rh / 2), axis: 'x' as const },
      { mesh: edge(T, rh, 0, -rh / 2, cx + rw / 2, cy + rh / 2), axis: 'y' as const },
      { mesh: edge(rw, T, -rw / 2, 0, cx + rw / 2, cy - rh / 2), axis: 'x' as const },
      { mesh: edge(T, rh, 0, rh / 2, cx - rw / 2, cy - rh / 2), axis: 'y' as const },
    ];
    const fill = solid(new BoxGeometry(rw, rh, 0.006), fillColor);
    fill.position.set(cx, cy, z - 0.004);
    win.add(fill);
    const handleGeometry = new BoxGeometry(0.036, 0.036, 0.02);
    const handles = [
      [cx - rw / 2, cy + rh / 2],
      [cx + rw / 2, cy + rh / 2],
      [cx + rw / 2, cy - rh / 2],
      [cx - rw / 2, cy - rh / 2],
    ].map(([x, y]) => {
      const h = solid(handleGeometry, lit);
      h.position.set(x, y, z + 0.006);
      win.add(h);
      return h;
    });

    const span = (p: number, a: number, b: number) => MathUtils.clamp((p - a) / (b - a), 0, 1);
    const grow = (o: { visible: boolean; scale: { setScalar(n: number): void } }, t: number) => {
      o.visible = t > 0;
      o.scale.setScalar(Math.max(0.001, easeOut(t)));
    };

    return (progress: number) => {
      // 0–0.15: the window stands up.
      const stand = span(progress, 0, 0.15);
      win.visible = stand > 0;
      win.scale.set(1, Math.max(0.001, easeOut(stand)), 1);
      // 0.15–0.3: toolbar and sidebar slide in, with the existing layers.
      const chrome = easeOut(span(progress, 0.15, 0.3));
      toolbar.visible = sidebar.visible = chrome > 0;
      toolbar.scale.x = Math.max(0.001, chrome);
      sidebar.scale.y = Math.max(0.001, chrome);
      rows[0].visible = rows[1].visible = chrome > 0.6;
      // 0.3–0.66: the rectangle traces itself, one edge after another.
      edges.forEach(({ mesh, axis }, i) => {
        const t = span(progress, 0.3 + i * 0.09, 0.39 + i * 0.09);
        mesh.visible = t > 0;
        mesh.scale[axis] = Math.max(0.001, t);
      });
      // 0.66–0.76: it fills.
      grow(fill, span(progress, 0.66, 0.76));
      // 0.76–0.88: selection handles pop on, and its layer row lights up in the sidebar.
      const select = span(progress, 0.76, 0.88);
      for (const h of handles) grow(h, select);
      grow(rows[2], select);
    };
  }

  private track<M extends Material>(material: M): M {
    this.materials.push(material);
    return material;
  }
}

function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}
