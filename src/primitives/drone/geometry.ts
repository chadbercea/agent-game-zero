import {
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  RingGeometry,
  TorusGeometry,
} from 'three';

/**
 * Drone geometry, shared by every drone instance. Units: the shell is roughly
 * 1.1 wide; rotor tips reach ~1.35 from center.
 */
export interface DroneGeometry {
  shell: BufferGeometry;
  lensHousing: BufferGeometry;
  lensGlass: BufferGeometry;
  lensRing: BufferGeometry;
  arm: BufferGeometry;
  knuckle: BufferGeometry;
  motorCap: BufferGeometry;
  motorBand: BufferGeometry;
  foot: BufferGeometry;
  footAccent: BufferGeometry;
  rotorHub: BufferGeometry;
  rotorBlade: BufferGeometry;
  rotorBlur: BufferGeometry;
  rotorRim: BufferGeometry;
}

export const ARM_REACH = 0.92;
export const ROTOR_RADIUS = 0.33;

let cache: DroneGeometry | undefined;

export function droneGeometry(): DroneGeometry {
  return (cache ??= build());
}

function build(): DroneGeometry {
  // Faceted, slightly squat shell: a low-detail icosphere flattened on Y.
  const shell = new IcosahedronGeometry(0.56, 1);
  shell.scale(1.08, 0.72, 0.98);

  // Octagonal camera bezel facing +Z, flat edge on top.
  const lensHousing = new CylinderGeometry(0.29, 0.33, 0.12, 8, 1);
  lensHousing.rotateY(Math.PI / 8);
  lensHousing.rotateX(Math.PI / 2);

  const lensGlass = new CircleGeometry(0.21, 32);
  const lensRing = new TorusGeometry(0.155, 0.026, 10, 48);

  // Arm strut runs along +X from the shoulder pivot.
  const arm = new BoxGeometry(ARM_REACH - 0.28, 0.07, 0.1);
  arm.translate((ARM_REACH - 0.28) / 2 + 0.28, 0, 0);

  const knuckle = new BoxGeometry(0.16, 0.12, 0.15);

  const motorCap = new CylinderGeometry(0.105, 0.12, 0.13, 10);
  const motorBand = new CylinderGeometry(0.124, 0.124, 0.045, 10);
  const foot = new CylinderGeometry(0.125, 0.11, 0.05, 10);
  const footAccent = new CylinderGeometry(0.112, 0.112, 0.018, 10);

  const rotorHub = new CylinderGeometry(0.04, 0.045, 0.06, 8);
  const rotorBlade = new BoxGeometry(ROTOR_RADIUS * 2, 0.012, 0.065);
  const rotorBlur = new CircleGeometry(ROTOR_RADIUS, 40);
  rotorBlur.rotateX(-Math.PI / 2);
  const rotorRim = new RingGeometry(ROTOR_RADIUS - 0.03, ROTOR_RADIUS, 48);
  rotorRim.rotateX(-Math.PI / 2);

  return {
    shell,
    lensHousing,
    lensGlass,
    lensRing,
    arm,
    knuckle,
    motorCap,
    motorBand,
    foot,
    footAccent,
    rotorHub,
    rotorBlade,
    rotorBlur,
    rotorRim,
  };
}
