import { MathUtils } from 'three';
import type { Status } from '../core/palette';
import { statusSignal } from './statusSignal';
import { type Drone, HALO_OPACITY, HOVER_HEIGHT, RING_GLOW } from '../primitives/drone/Drone';

/** Continuous motion parameters each status eases toward. */
interface MotionProfile {
  rotorSpeed: number; // rad/s
  hoverOffset: number; // world units relative to HOVER_HEIGHT
  bobAmplitude: number;
  bobPeriod: number; // seconds
  armFlex: number; // radians of articulated arm pitch oscillation
  armDroop: number; // static arm pitch, negative = tips down
  pitch: number; // body nose-down lean
  scan: number; // body yaw sweep amplitude
}

const PROFILES: Record<Status, MotionProfile> = {
  // Spin loop: fast rotors, tight busy bob, arms working in sequence, leaning into the task.
  working: { rotorSpeed: 42, hoverOffset: 0, bobAmplitude: 0.035, bobPeriod: 0.7, armFlex: 0.09, armDroop: 0, pitch: 0.1, scan: 0.06 },
  // Hover low → hover high: calm, slow, level. Nothing is wrong.
  waiting: { rotorSpeed: 26, hoverOffset: 0.05, bobAmplitude: 0.16, bobPeriod: 3.2, armFlex: 0.02, armDroop: 0.03, pitch: 0, scan: 0 },
  // Halted: rotors spool down, the drone sags, arms hang.
  stopped: { rotorSpeed: 4, hoverOffset: -0.2, bobAmplitude: 0.015, bobPeriod: 2.4, armFlex: 0, armDroop: -0.2, pitch: 0.16, scan: 0 },
};

/** How fast continuous parameters converge on a new status (per second). */
const EASE = 3.2;
const SHAKE_DURATION = 0.75;
const START_KICK_DURATION = 0.5;

/**
 * Drives a Drone's rig from its status. Holds no visual state of its own
 * beyond eased parameters, so any drone can be animated by any animator.
 */
export class DroneAnimator {
  private readonly current: MotionProfile;
  private lastStatus: Status;
  private time: number;
  private rotorAngle = 0;
  private shake = 0;
  private kick = 0;
  /** Desynchronizes crowds of drones. */
  private readonly phase: number;

  constructor(private readonly drone: Drone, seed = Math.random()) {
    this.lastStatus = drone.status;
    this.current = { ...PROFILES[drone.status] };
    this.phase = seed * Math.PI * 2;
    this.time = seed * 10;
  }

  update(dt: number): void {
    const { drone } = this;
    const status = drone.status;
    if (status !== this.lastStatus) this.enter(status);

    this.time += dt;
    const t = this.time;
    const target = PROFILES[status];
    const k = 1 - Math.exp(-EASE * dt);
    for (const key of Object.keys(target) as (keyof MotionProfile)[]) {
      this.current[key] = MathUtils.lerp(this.current[key], target[key], k);
    }
    const c = this.current;

    this.shake = Math.max(0, this.shake - dt);
    this.kick = Math.max(0, this.kick - dt);

    // Hover.
    const { hover, body, arms, ringMaterial, haloMaterial, blurMaterial, bladeMaterial } = drone.rig;
    const bob = Math.sin((t / c.bobPeriod) * Math.PI * 2 + this.phase) * c.bobAmplitude;
    const kick = Math.sin((1 - this.kick / START_KICK_DURATION) * Math.PI) * 0.12 * Number(this.kick > 0);
    hover.position.y = HOVER_HEIGHT + c.hoverOffset + bob + kick;

    // Shake / error: sharp decaying jitter on entering Stopped.
    const s = this.shake / SHAKE_DURATION;
    const jitter = s * s * 0.14;
    hover.position.x = Math.sin(t * 61) * jitter * 0.6;
    hover.rotation.z = Math.sin(t * 47 + 1.3) * jitter;

    body.rotation.x = c.pitch + Math.sin(t * 1.7 + this.phase) * 0.015;
    body.rotation.y = Math.sin(t * 1.1 + this.phase) * c.scan;

    // Arms: each pivots on its shoulder; working flex runs as a ripple around the body.
    arms.forEach((arm, i) => {
      const ripple = Math.sin(t * 6 + i * (Math.PI / 2) + this.phase) * c.armFlex;
      arm.pivot.rotation.z = c.armDroop + ripple;
      arm.rotor.rotation.y = this.rotorAngle * (i % 2 === 0 ? 1 : -1);
    });
    this.rotorAngle = (this.rotorAngle + c.rotorSpeed * dt) % (Math.PI * 2);

    // Fast rotors read as a blurred disc; slow rotors show their blades.
    const spin = MathUtils.clamp(c.rotorSpeed / 40, 0, 1);
    blurMaterial.opacity = 0.05 + spin * 0.2;
    bladeMaterial.opacity = 1 - spin * 0.85;

    const glow = statusSignal(status, t, this.phase);
    ringMaterial.emissiveIntensity = RING_GLOW * glow;
    haloMaterial.opacity = HALO_OPACITY * glow;
  }

  private enter(status: Status): void {
    if (status === 'stopped') this.shake = SHAKE_DURATION;
    if (status === 'working') this.kick = START_KICK_DURATION;
    this.lastStatus = status;
  }
}
