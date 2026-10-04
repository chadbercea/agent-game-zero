import { type BufferGeometry, type Material, Mesh, type Object3D } from 'three';

/** A mesh that casts and receives shadows. */
export function solid(geometry: BufferGeometry, material: Material): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Set an object's height and return it, for terse part assembly. */
export function at<T extends Object3D>(object: T, y: number): T {
  object.position.y = y;
  return object;
}
