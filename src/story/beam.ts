import { type Color, type Curve, MathUtils, type Mesh, type Object3D, type Vector3 } from 'three';
import { PacketFlight } from '../animation/PacketFlight';
import type { SystemKind } from '../primitives/node/emblems';
import { Packet } from '../primitives/packet/Packet';
import { Product } from '../primitives/product/Product';
import type { SceneHost } from '../stage/Stage';

/**
 * Send one packet between two objects (drone hover points) and resolve when
 * it lands. Trails stay hidden: lines are never persistent in Runtime.
 */
export function beam(stage: SceneHost, from: Object3D, to: Object3D): Promise<void> {
  const packet = new Packet();
  packet.trail.visible = false;
  const flight = new PacketFlight(packet, from, to);
  stage.add(packet);
  return new Promise((resolve) => {
    const untick = stage.onTick((dt) => {
      flight.update(dt);
      if (!flight.done) return;
      untick();
      packet.dispose();
      resolve();
    });
  });
}

/** Packets shot along a branch run just above the line, fast. */
export const SHOT_SPEED = 6.5;
const SHOT_HEIGHT = 0.16;
/** Products ride a little higher than cubes: they stand upright. */
const PRODUCT_RIDE = 0.2;

/**
/** A stretch of floor where packets ride faster and glow (an information highway). */
export interface Boost {
  at: (p: Vector3) => boolean;
  /** Speed multiplier inside. */
  speed: number;
  glow: Color;
}

/**
 * Shoot one piece of work along a floor path (a branch, from its node to the
 * gate; a graph link), riding just above the line, and resolve when it lands.
 * It pops in at the start and shrinks into the far end. With `kind`, it's that
 * system's product (see Product); without, a plain gray packet.
 */
export function shoot(
  stage: SceneHost,
  path: Curve<Vector3>,
  speed = SHOT_SPEED,
  boost?: Boost,
  kind?: SystemKind,
): Promise<void> {
  // A system's work rides the line as that system's product; plain information is a gray cube.
  const packet = kind ? undefined : new Packet();
  const product = kind ? new Product(kind) : undefined;
  const body = (product ?? packet!.cube) as Mesh;
  const material = product?.material ?? packet!.cubeMaterial;
  if (packet) packet.trail.visible = false;
  stage.add(product ?? packet!);
  if (boost) material.emissiveIntensity = 0;
  const length = path.getLength();
  let travelled = 0;
  return new Promise((resolve) => {
    const untick = stage.onTick((dt) => {
      const boosted = boost?.at(body.position) ?? false;
      travelled = Math.min(length, travelled + speed * (boosted ? boost!.speed : 1) * dt);
      if (boost) {
        material.emissive.copy(boost.glow);
        const k = 1 - Math.exp(-10 * dt);
        material.emissiveIntensity = MathUtils.lerp(material.emissiveIntensity, boosted ? 1.4 : 0, k);
      }
      const t = travelled / length;
      path.getPointAt(t, body.position);
      // Cubes tumble; products ride upright, facing the camera, so their shape reads.
      body.position.y = product ? PRODUCT_RIDE : SHOT_HEIGHT;
      if (!product) body.rotation.y += dt * 6;
      const pop = Math.min(1, t / 0.08) * (1 - MathUtils.smoothstep(t, 0.9, 1));
      body.scale.setScalar(Math.max(0.001, pop * (product ? 1 : 0.8)));
      if (t < 1) return;
      untick();
      if (product) product.dispose();
      else packet!.dispose();
      resolve();
    });
  });
}
