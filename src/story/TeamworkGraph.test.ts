import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { ATLASSIAN_KINDS, JOB_KINDS } from '../primitives/node/emblems';
import type { SystemNode } from '../primitives/node/SystemNode';
import type { SceneHost } from '../stage/Stage';
import { GATEWAY, storyLayout } from './layout';
import { TeamworkGraph } from './TeamworkGraph';

type Tick = (dt: number, elapsed: number) => void;

/** The story's graph on a fake stage: nodes stand where the story layout puts them. */
function setup() {
  const ticks: Tick[] = [];
  let elapsed = 0;
  const stage = { onTick: (fn: Tick) => (ticks.push(fn), () => {}), add: () => {} } as unknown as SceneHost;
  // Story steps chain promises between ticks, so let them settle after every step.
  const advance = async (seconds: number, step = 0.05) => {
    for (let t = 0; t < seconds; t += step) {
      elapsed += step;
      for (const fn of [...ticks]) fn(step, elapsed);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  };
  const {
    maps: [m1, m2],
    lines,
    feeders,
  } = storyLayout();
  const nodes = (kinds: readonly string[], spots: Vector3[]) =>
    kinds.map((kind, i) => ({ kind, position: spots[i] }) as unknown as SystemNode);
  const graph = new TeamworkGraph(stage, [nodes(JOB_KINDS, m1.spots), nodes(ATLASSIAN_KINDS, m2.spots)], {
    lines,
    feeders,
    gateway: GATEWAY,
    highways: false,
  });
  const tunnel = { streams: 0 };
  graph.feed(tunnel);
  return { graph, tunnel, advance, stage };
}

describe('TeamworkGraph feeding the gateway', () => {
  it('lets the streams start only once the lines are connected', async () => {
    const { graph, tunnel, advance, stage } = setup();
    tunnel.streams = 1;
    await advance(0.05);
    expect(tunnel.streams).toBe(0);
    const revealed = graph.reveal(stage);
    await advance(1);
    tunnel.streams = 1;
    await advance(0.05);
    expect(tunnel.streams).toBe(0); // feeders still drawing in
    await advance(12);
    await revealed;
    tunnel.streams = 1;
    await advance(0.05);
    expect(graph.feedersConnected).toBe(1);
    expect(tunnel.streams).toBe(1);
  });

  it('fades the streams with the lines, never after, and stops them when the lines are gone', async () => {
    const { graph, tunnel, advance, stage } = setup();
    graph.showAll();
    tunnel.streams = 1;
    const fading = graph.fade(stage, 1);
    let last = 1;
    for (let i = 0; i < 24; i++) {
      await advance(0.05);
      expect(tunnel.streams).toBeLessThanOrEqual(graph.feedersConnected + 1e-9);
      expect(tunnel.streams).toBeLessThanOrEqual(last + 1e-9);
      last = tunnel.streams;
    }
    expect(tunnel.streams).toBeLessThan(0.2);
    await advance(0.2);
    await fading;
    expect(tunnel.streams).toBe(0);
  });

  it('stops the streams the moment the graph is hidden', () => {
    const { graph, tunnel } = setup();
    graph.showAll();
    tunnel.streams = 1;
    graph.hide();
    expect(tunnel.streams).toBe(0);
    expect(graph.feedersConnected).toBe(0);
  });
});
