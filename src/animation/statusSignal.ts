import type { Status } from '../core/palette';

/**
 * Brightness multiplier (0–1) for status lights at time `t`. Working pulses,
 * Waiting holds steady, Stopped blinks. Shared so a drone's lens and its
 * task's screen blink together when they share a clock.
 */
export function statusSignal(status: Status, t: number, phase = 0): number {
  if (status === 'working') return 0.75 + 0.25 * Math.sin(t * 7 + phase);
  if (status === 'stopped') return Math.sin(t * 9) > -0.2 ? 1 : 0.15;
  return 1;
}
