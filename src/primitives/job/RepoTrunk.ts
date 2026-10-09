import { CylinderGeometry, Group, type Material, MathUtils, type Mesh, MeshStandardMaterial, SphereGeometry } from 'three';
import { solid } from '../../core/mesh';
import { NEUTRAL } from '../../core/palette';

/** Commits shown at most; past that the oldest slide off the bottom (the history goes on, out of view). */
export const TRUNK_SHOWN = 6;
const GAP = 0.13;
const BASE = 0.12;
const EASE = 8;

/**
 * A repo's trunk: the final state a source code manager keeps. A graphite
 * trunk standing at the SCM node with one white commit per squash merge
 * (`commit()`); the newest pops in on top, and once there are more than
 * TRUNK_SHOWN the oldest slides off the bottom. `count` is every commit
 * ever made. Call `update(dt)` each frame.
 */
export class RepoTrunk extends Group {
  /** Every commit merged so far. */
  count = 0;
  private readonly trunk: Mesh;
  private readonly commits: { mesh: Mesh; material: MeshStandardMaterial; index: number }[] = [];
  private readonly graphite: Material;
  private readonly geometry = new SphereGeometry(0.055, 12, 8);
  private shownHeight = 0;

  constructor() {
    super();
    this.graphite = new MeshStandardMaterial({ color: NEUTRAL.graphite, roughness: 0.45 });
    this.trunk = solid(new CylinderGeometry(0.026, 0.026, 1, 8), this.graphite);
    this.trunk.scale.y = 0.001;
    this.add(this.trunk);
  }

  /** How many commits are on view. */
  get shown(): number {
    return this.commits.filter((c) => c.material.opacity > 0.5).length;
  }

  /** One squashed commit lands on top. */
  commit(): void {
    const index = this.count++;
    const material = new MeshStandardMaterial({ color: NEUTRAL.shell, roughness: 0.4, transparent: true, opacity: 1 });
    const mesh = solid(this.geometry, material);
    mesh.scale.setScalar(0.001);
    mesh.position.y = this.rowY(index) + 0.08;
    this.add(mesh);
    this.commits.push({ mesh, material, index });
  }

  update(dt: number): void {
    const k = 1 - Math.exp(-EASE * dt);
    const first = Math.max(0, this.count - TRUNK_SHOWN);
    for (let i = this.commits.length - 1; i >= 0; i--) {
      const c = this.commits[i];
      const off = c.index < first;
      c.mesh.position.y += (this.rowY(c.index) - c.mesh.position.y) * k;
      c.mesh.scale.setScalar(MathUtils.lerp(c.mesh.scale.x, 1, k));
      c.material.opacity += ((off ? 0 : 1) - c.material.opacity) * k;
      if (off && c.material.opacity < 0.02) {
        c.mesh.removeFromParent();
        c.material.dispose();
        this.commits.splice(i, 1);
      }
    }
    const target = this.count ? BASE + (Math.min(this.count, TRUNK_SHOWN) - 1) * GAP + 0.1 : 0.001;
    this.shownHeight += (target - this.shownHeight) * k;
    this.trunk.scale.y = Math.max(0.001, this.shownHeight);
    this.trunk.position.y = this.shownHeight / 2;
  }

  dispose(): void {
    this.removeFromParent();
    this.geometry.dispose();
    this.trunk.geometry.dispose();
    this.graphite.dispose();
    for (const c of this.commits) c.material.dispose();
  }

  /** Where commit `index` sits: rows from the base, scrolled so the newest is on top. */
  private rowY(index: number): number {
    const first = Math.max(0, this.count - TRUNK_SHOWN);
    return BASE + (index - first) * GAP;
  }
}
