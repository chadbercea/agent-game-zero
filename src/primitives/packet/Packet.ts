import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
} from 'three';
import { NEUTRAL } from '../../core/palette';

export const PACKET_SIZE = 0.2;
export const TRAIL_MAX_DOTS = 96;

let shared: { cube: BoxGeometry; dot: SphereGeometry } | undefined;

/**
 * Packet primitive: one neutral gray unit of information, plus the dotted
 * trail of the route it travels. The group stays at the world origin; `cube`
 * and the trail dots are placed in world space by whatever moves the packet
 * (see PacketFlight).
 */
export class Packet extends Group {
  readonly cube: Mesh;
  readonly trail: InstancedMesh;
  readonly cubeMaterial: MeshStandardMaterial;
  readonly trailMaterial: MeshBasicMaterial;

  constructor() {
    super();
    const g = (shared ??= {
      cube: new BoxGeometry(PACKET_SIZE, PACKET_SIZE, PACKET_SIZE),
      dot: new SphereGeometry(0.018, 6, 4),
    });
    const color = NEUTRAL.packet;

    this.cubeMaterial = new MeshStandardMaterial({ color, roughness: 0.4, flatShading: true });
    this.cube = new Mesh(g.cube, this.cubeMaterial);
    this.cube.castShadow = true;
    this.add(this.cube);

    this.trailMaterial = new MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false });
    this.trail = new InstancedMesh(g.dot, this.trailMaterial, TRAIL_MAX_DOTS);
    this.trail.count = 0;
    this.trail.frustumCulled = false;
    this.add(this.trail);
  }

  dispose(): void {
    this.removeFromParent();
    this.trail.dispose();
    this.cubeMaterial.dispose();
    this.trailMaterial.dispose();
  }
}
