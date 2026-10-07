import { describe, expect, it } from 'vitest';
import { Assembler } from './Assembler';

describe('Assembler', () => {
  it('takes eight little blocks, fuses them into one bigger block, then starts over', () => {
    const a = new Assembler();
    for (let i = 0; i < 8; i++) expect(a.addBlock()).toBe(true);
    expect(a.addBlock()).toBe(false);
    expect(a.ready).toBe(false);
    for (let i = 0; i < 60; i++) a.update(0.05);
    expect(a.ready).toBe(true);
    const block = a.take();
    expect(block).not.toBeNull();
    expect(a.count).toBe(0);
    expect(a.ready).toBe(false);
    expect(a.take()).toBeNull();
    expect(a.addBlock()).toBe(true);
  });
});
