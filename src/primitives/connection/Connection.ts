import { Group, InstancedMesh, MeshBasicMaterial, SphereGeometry } from 'three';
import { LINEAGE, type Lineage } from '../../core/palette';

export const CONNECTION_MAX_DOTS = 160;

let dotGeometry: SphereGeometry | undefined;

/**
 * Connection primitive: a thin dotted path between two agents, in their
 * lineage color. Hidden in Runtime, revealed in Detail. The group stays at
 * the world origin; dots are placed in world space by ConnectionReveal.
 */
export class Connection extends Group {
  readonly dots: InstancedMesh;
  readonly material: MeshBasicMaterial;

  constructor(lineage: Lineage) {
    super();
    this.material = new MeshBasicMaterial({ color: LINEAGE[lineage], transparent: true, opacity: 0, depthWrite: false });
    this.dots = new InstancedMesh((dotGeometry ??= new SphereGeometry(0.024, 6, 4)), this.material, CONNECTION_MAX_DOTS);
    this.dots.count = 0;
    this.dots.frustumCulled = false;
    this.add(this.dots);
  }

  dispose(): void {
    this.removeFromParent();
    this.dots.dispose();
    this.material.dispose();
  }
}
