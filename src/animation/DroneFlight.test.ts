import { Object3D, QuadraticBezierCurve3, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { DroneFlight, FLIGHT_SPEED } from './DroneFlight';

function fakeDrone(x = 0, z = 0, yaw = Math.PI / 4) {
  const drone = new Object3D();
  drone.position.set(x, 0, z);
  drone.rotation.y = yaw;
  return Object.assign(drone, { rig: { tilt: new Object3D() } });
}

const DT = 1 / 60;

function run(flight: DroneFlight, seconds: number, onFrame?: () => void) {
  for (let i = 0; i < seconds / DT; i++) {
    flight.update(DT);
    onFrame?.();
  }
}

describe('DroneFlight', () => {
  it('hops to a target and lands exactly there, at floor level', () => {
    const drone = fakeDrone(0, 0);
    const flight = DroneFlight.to(drone, new Vector3(4, 0, -3));
    let maxY = 0;
    run(flight, 10, () => (maxY = Math.max(maxY, drone.position.y)));
    expect(flight.done).toBe(true);
    expect(drone.position.distanceTo(new Vector3(4, 0, -3))).toBeLessThan(1e-6);
    expect(maxY).toBeGreaterThan(0.2); // the hop rises mid-flight
  });

  it('takes about distance / speed to arrive', () => {
    const drone = fakeDrone();
    const flight = DroneFlight.to(drone, new Vector3(FLIGHT_SPEED * 2, 0, 0));
    run(flight, 1.9);
    expect(flight.done).toBe(false);
    run(flight, 0.2);
    expect(flight.done).toBe(true);
  });

  it('rides a curve through its middle, not a straight line', () => {
    const drone = fakeDrone(0, 0);
    const branch = new QuadraticBezierCurve3(new Vector3(0, 0, 0), new Vector3(2, 0, 3), new Vector3(4, 0, 0));
    const flight = DroneFlight.along(drone, branch);
    let maxZ = 0;
    run(flight, 10, () => (maxZ = Math.max(maxZ, drone.position.z)));
    expect(flight.done).toBe(true);
    expect(drone.position.distanceTo(new Vector3(4, 0, 0))).toBeLessThan(1e-6);
    expect(maxZ).toBeGreaterThan(1); // followed the bend
    expect(drone.position.y).toBe(0);
  });

  it('leans into travel without turning, and levels out after landing', () => {
    const drone = fakeDrone(0, 0, Math.PI / 4);
    const flight = DroneFlight.to(drone, new Vector3(6, 0, 0));
    let maxLean = 0;
    run(flight, 1.2, () => {
      const { x, z } = drone.rig.tilt.rotation;
      maxLean = Math.max(maxLean, Math.hypot(x, z));
    });
    expect(maxLean).toBeGreaterThan(0.05);
    expect(maxLean).toBeLessThanOrEqual(0.22 * Math.SQRT2 + 1e-9);
    expect(drone.rotation.y).toBe(Math.PI / 4);
    run(flight, 6);
    expect(Math.hypot(drone.rig.tilt.rotation.x, drone.rig.tilt.rotation.z)).toBeLessThan(0.01);
  });
});
