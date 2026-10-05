import type { Status } from '../core/palette';

/**
 * Brightness multiplier (0–1) for status lights at time `t`. Working pulses
 * gently, Waiting holds steady, Stopped pulses slowly and deeply. Shared so a
 * drone's lens and a pad's screen pulse together when they share a clock.
 */
export function statusSignal(status: Status, t: number, phase = 0): number {
  if (status === 'working') return 0.85 + 0.15 * Math.sin(t * 4 + phase);
  // A slow, smooth pulse rather than a hard on/off blink.
  if (status === 'stopped') return 0.4 + 0.6 * (0.5 + 0.5 * Math.cos(t * 4));
  return 1;
}
