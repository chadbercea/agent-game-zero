import type { Mesh, MeshStandardMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { PhoneCall, RING_SECONDS } from './PhoneCall';

/** The sound arcs' opacities, inner to outer. */
const arcs = (p: PhoneCall) =>
  p.children[0].children.slice(1).map((g) => ((g.children[0] as Mesh).material as MeshStandardMaterial).opacity);

describe('PhoneCall', () => {
  it('is quiet until it rings', () => {
    const phone = new PhoneCall();
    for (let i = 0; i < 20; i++) phone.update(0.03);
    expect(arcs(phone).every((o) => o === 0)).toBe(true);
  });

  it('rings in waves: across one ring, every arc lights up at some point', () => {
    const phone = new PhoneCall();
    phone.ringing = 1;
    const peak = [0, 0, 0];
    for (let t = 0; t < RING_SECONDS; t += 0.01) {
      phone.update(0.01);
      arcs(phone).forEach((o, i) => (peak[i] = Math.max(peak[i], o)));
    }
    expect(peak.every((p) => p > 0.8)).toBe(true);
  });

  it('fades out with its opacity', () => {
    const phone = new PhoneCall();
    phone.ringing = 1;
    phone.opacity = 0;
    phone.update(RING_SECONDS / 2);
    expect(arcs(phone).every((o) => o === 0)).toBe(true);
  });
});
