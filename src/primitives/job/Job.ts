import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  type Material,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  QuadraticBezierCurve3,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { at, solid } from '../../core/mesh';
import { NEUTRAL, STATUS_COLOR } from '../../core/palette';
import type { SystemKind } from '../node/emblems';

/** What each system's job is, in words (labels, logs). */
export const JOB_TITLE: Record<SystemKind, string> = {
  figma: 'Reference the design → write a report',
  github: 'Create a branch → git init',
  notion: 'Read the PRD',
};

/** Where the work product floats when a job completes: beside the work, clear of the sub-agent above. */
export const PRODUCT_OFFSET = { x: 0.42, y: 0.55, z: 0.12 } as const;

/**
 * Job primitive: the visible work a sub-agent does at a system node. `progress`
 * (0–1) builds the job's visual; at 1 the work product (the old work cube)
 * appears, ready to be carried home. Each system has its own visual:
 * - Figma: report sheets stack up, page by page
 * - GitHub: a git graph grows and forks, then an init folder appears
 * - Notion: a page is scanned top to bottom, lines lighting as they're read
 */
export class Job extends Group {
  readonly kind: SystemKind;
  /** The work product: appears when the job completes; carried home on return. */
  readonly product: Mesh;
  private _progress = 0;
  private time = 0;
  private readonly materials: Material[] = [];
  private readonly build: (progress: number, time: number) => void;

  constructor(kind: SystemKind) {
    super();
    this.kind = kind;
    this.name = `job:${kind}`;
    const shell = this.track(new MeshStandardMaterial({ color: NEUTRAL.shell, roughness: 0.4, flatShading: true }));
    const graphite = this.track(new MeshStandardMaterial({ color: NEUTRAL.graphite, roughness: 0.45, flatShading: true }));
    const lit = this.track(
      new MeshStandardMaterial({ color: STATUS_COLOR.working, emissive: STATUS_COLOR.working, emissiveIntensity: 0.6 }),
    );

    if (kind === 'figma') this.build = this.buildReport(shell, graphite);
    else if (kind === 'github') this.build = this.buildBranch(shell, graphite);
    else this.build = this.buildRead(shell, graphite, lit);

    const productMaterial = this.track(new MeshStandardMaterial({ color: NEUTRAL.packet, roughness: 0.4, flatShading: true }));
    this.product = solid(new RoundedBoxGeometry(0.22, 0.22, 0.22, 2, 0.04), productMaterial);
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

  /** Figma: up to five report sheets settle onto a stack, each ruled with lines of text. */
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

  /** Notion: a standing page with lines of text; a scan bar reads it top to bottom, lighting lines as it passes. */
  private buildRead(shell: Material, graphite: Material, lit: Material) {
    const page = new Group();
    page.position.y = 0.62;
    this.add(page);
    page.add(solid(new BoxGeometry(0.44, 0.56, 0.03), shell));
    const LINES = 6;
    const lines = Array.from({ length: LINES }, (_, i) => {
      const line = solid(new BoxGeometry(i % 3 === 2 ? 0.2 : 0.32, 0.03, 0.012), graphite);
      line.position.set(i % 3 === 2 ? -0.06 : 0, 0.2 - i * 0.075, 0.021);
      page.add(line);
      return line;
    });
    const scanMaterial = this.track(
      new MeshBasicMaterial({ color: STATUS_COLOR.working, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    const scan = new Mesh(new PlaneGeometry(0.46, 0.035), scanMaterial);
    scan.position.z = 0.03;
    page.add(scan);

    return (progress: number, time: number) => {
      // The scan bar sweeps repeatedly; lines it has fully read stay lit.
      const read = progress * LINES;
      lines.forEach((line, i) => (line.material = i < Math.floor(read) ? lit : graphite));
      const sweeping = progress > 0 && progress < 1;
      scan.visible = sweeping;
      const y = 0.25 - ((time * 0.5) % 1) * 0.5;
      scan.position.y = y;
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
