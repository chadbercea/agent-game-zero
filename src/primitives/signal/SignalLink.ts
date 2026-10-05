import { Group, InstancedMesh, MeshBasicMaterial, SphereGeometry } from 'three';
import { NEUTRAL, STATUS_COLOR } from '../../core/palette';
import { PAD_TOP } from '../pad/Pad';

export const LINK_MAX_DOTS = 40;
export const BURST_DOTS = 5;
/** Half the gap between the two parallel streams. */
export const LANE_OFFSET = 0.055;

let dotGeometry: SphereGeometry | undefined;

/**
 * Signal link primitive: the line of communication between a drone and the
 * base it hovers over. Two parallel dot streams (green rising from the base,
 * gray falling from the drone) for a working conversation, and a five-dot
 * burst for the one-shot that a stopped drone sends into a red base.
 * Its origin sits on the base; SignalLinkAnimator places and colors the dots.
 */
export class SignalLink extends Group {
  /** Green dots, base → drone. */
  readonly rising: InstancedMesh;
  /** Gray dots, drone → base. */
  readonly falling: InstancedMesh;
  /** The stopped one-shot: dots leave the drone and sink into the base, turning red. */
  readonly burst: InstancedMesh;
  readonly risingMaterial: MeshBasicMaterial;
  readonly fallingMaterial: MeshBasicMaterial;
  readonly burstMaterial: MeshBasicMaterial;
  /** Height of the drone's underside, in this link's local units. */
  top = 1.7;
  /** Height of the base's top surface. */
  bottom = PAD_TOP;

  constructor() {
    super();
    const dot = (dotGeometry ??= new SphereGeometry(0.019, 8, 6));
    this.risingMaterial = new MeshBasicMaterial({ color: STATUS_COLOR.working, transparent: true, opacity: 0, depthWrite: false });
    this.fallingMaterial = new MeshBasicMaterial({ color: NEUTRAL.packet, transparent: true, opacity: 0, depthWrite: false });
    // Burst dots are colored per instance (gray → red as they sink in).
    this.burstMaterial = new MeshBasicMaterial({ color: 0xffffff });
    this.rising = this.stream(dot, this.risingMaterial, LINK_MAX_DOTS);
    this.falling = this.stream(dot, this.fallingMaterial, LINK_MAX_DOTS);
    this.burst = this.stream(dot, this.burstMaterial, BURST_DOTS);
  }

  dispose(): void {
    this.removeFromParent();
    for (const mesh of [this.rising, this.falling, this.burst]) mesh.dispose();
    for (const m of [this.risingMaterial, this.fallingMaterial, this.burstMaterial]) m.dispose();
  }

  private stream(geometry: SphereGeometry, material: MeshBasicMaterial, max: number): InstancedMesh {
    const mesh = new InstancedMesh(geometry, material, max);
    mesh.count = 0;
    mesh.frustumCulled = false;
    this.add(mesh);
    return mesh;
  }
}
