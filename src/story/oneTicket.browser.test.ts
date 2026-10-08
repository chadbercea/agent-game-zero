import { Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import type { SceneHost } from '../stage/Stage';
import { A_KINDS, A_LAYOUT, OneTicket } from './oneTicket';

/** A stage with no renderer: a scene root and a clock the test drives a frame at a time. */
function testStage(fps = 30) {
  const DT = 1 / fps;
  const root = new Object3D();
  const ticks = new Set<(dt: number) => void>();
  let clock = 0;
  const stage = {
    add: (...objects: Object3D[]) => root.add(...objects),
    onTick: (fn: (dt: number) => void) => {
      ticks.add(fn);
      return () => void ticks.delete(fn);
    },
  } as unknown as SceneHost;
  /** Advance the clock until `done()` or `seconds` pass; `each` sees every frame. */
  const run = async (seconds: number, done: () => boolean = () => false, each: (t: number) => void = () => {}) => {
    for (let t = 0; t < seconds && !done(); t += DT) {
      for (const fn of [...ticks]) fn(DT);
      clock += DT;
      each(clock);
      for (let i = 0; i < 6; i++) await Promise.resolve();
    }
  };
  return { root, stage, run, now: () => clock };
}

describe('OneTicket, Version A beats 1–2', () => {
  it('lays out home, then Linear, Notion, Figma, GitHub in a row, each with its own gate in front', () => {
    const { stage } = testStage();
    const story = new OneTicket(stage);
    expect(story.stops.map((s) => s.kind)).toEqual(['linear', 'notion', 'figma', 'github']);
    // Left to right on screen (screen-right is +x, −z), home first.
    const screenX = (p: { x: number; z: number }) => p.x - p.z;
    const xs = [A_LAYOUT.home, ...A_LAYOUT.nodes].map(screenX);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    // Each gate stands straight in front of its node (toward the camera), not beside it.
    for (const { node, gate } of story.stops) {
      expect(screenX(gate.position)).toBeCloseTo(screenX(node.position));
      expect(gate.position.x + gate.position.z).toBeGreaterThan(node.position.x + node.position.z);
    }
    expect(A_KINDS).toHaveLength(4);
  });

  it('lands ILI-990, crosses only the Linear gate, reads it, and comes home carrying the issue', async () => {
    const { stage, run, now } = testStage();
    const story = new OneTicket(stage);
    const { drone } = story;
    const linear = story.stop('linear');
    const seen = new Map<string, Set<string>>(story.stops.map((s) => [s.kind, new Set<string>()]));
    let leftHome = -1;
    let atNode = -1;
    let ticketMovingWhileDroneMoves = false;
    let lastDrone = drone.position.clone();
    let lastCard = 0;
    let played = false;
    void story.play('a2').then(() => (played = true));
    await run(
      60,
      () => played,
      (t) => {
        for (const s of story.stops) seen.get(s.kind)!.add(s.gate.state);
        const droneMoved = drone.position.distanceTo(lastDrone) > 1e-6;
        const cardMoved = Math.abs(story.ticket.card.position.y - lastCard) > 1e-6;
        if (droneMoved && cardMoved && story.ticket.visible) ticketMovingWhileDroneMoves = true;
        if (droneMoved && leftHome < 0) leftHome = t;
        if (atNode < 0 && linear.gate.state === 'open' && drone.position.distanceTo(linear.node.position) < 1e-3) atNode = t;
        lastDrone = drone.position.clone();
        lastCard = story.ticket.card.position.y;
      },
    );
    expect(played).toBe(true);

    // The ticket landed and stayed in Linear, with its link on to Notion showing.
    expect(story.ticket.visible).toBe(true);
    expect(story.ticket.request.key).toBe('ILI-990');
    expect(story.link.visible).toBe(true);
    // Access at the Linear gate went yellow, then green; no other gate ever lit; nothing was denied.
    expect([...seen.get('linear')!]).toEqual(expect.arrayContaining(['thinking', 'open']));
    for (const kind of ['notion', 'figma', 'github']) expect([...seen.get(kind)!]).toEqual(['off']);
    for (const states of seen.values()) expect(states.has('denied')).toBe(false);
    // Crossing the gate (home, through the check, on to the node) takes about three seconds.
    expect(atNode - leftHome).toBeGreaterThan(2.5);
    expect(atNode - leftHome).toBeLessThan(3.5);
    // One thing moves at a time: the ticket's drop never overlaps D3V1N's flight.
    expect(ticketMovingWhileDroneMoves).toBe(false);
    // Home, carrying exactly one product: the Linear issue. The gate closed behind it.
    expect(drone.position.distanceTo(A_LAYOUT.home)).toBeLessThan(1e-3);
    expect(story.carried.map((p) => p.kind)).toEqual(['linear']);
    expect(linear.gate.state).toBe('off');
    expect(now()).toBeLessThan(20);
  });

  it('follows the links: Notion, then Figma, each through its own gate, home between, carrying three', async () => {
    const { stage, run } = testStage();
    const story = new OneTicket(stage);
    const { drone } = story;
    /** Gate states in the order they first changed, one entry per change: who lit, and when. */
    const lit: string[] = [];
    let homeVisits = 0;
    let wasHome = true;
    const last = new Map(story.stops.map((s) => [s.kind, s.gate.state]));
    let played = false;
    void story.play('a4').then(() => (played = true));
    await run(
      90,
      () => played,
      () => {
        for (const s of story.stops) {
          if (s.gate.state !== last.get(s.kind)) lit.push(`${s.kind}:${s.gate.state}`);
          last.set(s.kind, s.gate.state);
        }
        // Never two gates lit at once.
        expect(story.stops.filter((s) => s.gate.state !== 'off').length).toBeLessThanOrEqual(1);
        const home = drone.position.distanceTo(A_LAYOUT.home) < 1e-3;
        if (home && !wasHome) homeVisits++;
        wasHome = home;
      },
    );
    expect(played).toBe(true);
    expect(lit).toEqual([
      'linear:thinking', 'linear:open', 'linear:off',
      'notion:thinking', 'notion:open', 'notion:off',
      'figma:thinking', 'figma:open', 'figma:off',
    ]);
    expect(homeVisits).toBe(3);
    expect(story.carried.map((p) => p.kind)).toEqual(['linear', 'notion', 'figma']);
    expect(story.link.visible && story.prdLink.visible).toBe(true);
    // GitHub's turn hasn't come.
    expect(story.stop('github').gate.state).toBe('off');
  });

  it('plays Version A end to end in about 30 s: plan, code in GitHub, a PR, Linear updated by hand', async () => {
    const { stage, run, now } = testStage();
    const story = new OneTicket(stage);
    const lit: string[] = [];
    const last = new Map(story.stops.map((s) => [s.kind, s.gate.state]));
    let ticketGreen = false;
    let played = false;
    void story.play('a7').then(() => (played = true));
    await run(
      120,
      () => played,
      () => {
        for (const s of story.stops) {
          if (s.gate.state === 'open' && last.get(s.kind) !== 'open') lit.push(s.kind);
          last.set(s.kind, s.gate.state);
        }
        if (story.pr.visible && story.ticket.glow > 0.9) ticketGreen = true;
      },
    );
    expect(played).toBe(true);
    expect(now()).toBeGreaterThan(25);
    expect(now()).toBeLessThan(35);
    // Four separate stops, then back to Linear to update the ticket.
    expect(lit).toEqual(['linear', 'notion', 'figma', 'github', 'linear']);
    expect(story.stops.map((s) => s.gate.visible)).toEqual([true, true, true, true]);
    // The stack became the plan; the branch grew with three commits on it; the PR opened; the ticket was updated.
    expect(story.carried).toHaveLength(0);
    expect(story.plan.visible).toBe(true);
    expect(story.branch.drawn).toBe(1);
    expect(story.commits).toHaveLength(3);
    expect(story.pr.visible).toBe(true);
    expect(ticketGreen).toBe(true);
    expect(story.drone.position.distanceTo(A_LAYOUT.home)).toBeLessThan(1e-3);
  });

  it('plays A5–7 on its own, starting from D3V1N home with all three carried', async () => {
    const { stage, run } = testStage();
    const story = new OneTicket(stage);
    let played = false;
    void story.play('a7', 'a5').then(() => (played = true));
    expect(story.carried.map((p) => p.kind)).toEqual(['linear', 'notion', 'figma']);
    expect(story.ticket.visible && story.link.visible && story.prdLink.visible).toBe(true);
    await run(60, () => played);
    expect(played).toBe(true);
    expect(story.plan.visible && story.pr.visible).toBe(true);
  });

  it('resets to an empty-handed D3V1N at home with no ticket, and plays the same again', async () => {
    const { stage, run } = testStage();
    const story = new OneTicket(stage);
    for (let i = 0; i < 2; i++) {
      let done = false;
      void story.play('a7').then(() => (done = true));
      await run(120, () => done);
      expect(story.plan.visible).toBe(true);
      done = false;
      void story.reset().then(() => (done = true));
      await run(10, () => done);
      expect(done).toBe(true);
      expect(story.carried).toHaveLength(0);
      expect(story.ticket.visible).toBe(false);
      expect(story.link.visible).toBe(false);
      expect(story.prdLink.visible).toBe(false);
      expect(story.plan.visible || story.pr.visible).toBe(false);
      expect(story.commits).toHaveLength(0);
      expect(story.branch.drawn).toBe(0);
      expect(story.stops.every((s) => s.gate.state === 'off')).toBe(true);
    }
  });
});
