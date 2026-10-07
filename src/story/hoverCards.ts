import type { Object3D } from 'three';
import { SYSTEM_NAME, type SystemKind } from '../primitives/node/emblems';
import { type CardModel, HoverCard } from '../stage/HoverCard';
import type { Stage } from '../stage/Stage';
import type { WorkLedger } from './ledger';
import type { ReviewStats } from './review';
import { TEAMWORK_LINKS } from './systemLayout';

/** Something on the grid you can hover, and the card it shows. */
export interface HoverTarget {
  object: Object3D;
  card: () => CardModel;
}

/** How many items under way a card lists before "and N more". */
const LIST = 3;
/** Seconds between refreshes of an open card, so its numbers move while you look. */
const REFRESH = 0.3;

const percent = (share: number) => `${share >= 0.095 ? Math.round(share * 100) : (share * 100).toFixed(1)}%`;

/** A system node's card: its counts, its share, what's under way, the systems the graph links it to. */
export function nodeCard(ledger: WorkLedger, id: string, kind: SystemKind): CardModel {
  const e = ledger.entity(id);
  const linked = TEAMWORK_LINKS.flatMap((l) => (l.a === kind ? [l.b] : l.b === kind ? [l.a] : []));
  return {
    title: e.name,
    subtitle: `System · ${e.system}`,
    ...counts(ledger, id, 'done today'),
    share: `${percent(ledger.share(id))} of everything done on the grid today`,
    worksWith: linked.map((k) => SYSTEM_NAME[k]),
  };
}

/** An agent's or sub-agent's card. `crew` is who it works with: its sub-agents, or its parent and node. */
export function agentCard(ledger: WorkLedger, id: string, crew: readonly string[]): CardModel {
  const e = ledger.entity(id);
  const sub = e.kind === 'sub-agent';
  return {
    title: e.name,
    subtitle: sub ? `Sub-agent · ${e.system}` : `Agent · ${e.system}`,
    ...counts(ledger, id, sub ? 'done this session' : 'done today'),
    share: sub
      ? `${percent(ledger.share(id))} of all sub-agent work this session`
      : `${percent(ledger.share(id))} of all agent work today`,
    worksWith: crew.length ? crew : ['no sub-agents out'],
  };
}

/** A gate's card: the collective volume of its whole system, node by node. */
export function gateCard(ledger: WorkLedger, system: string): CardModel {
  const t = ledger.totals('node', system);
  const nodes = ledger.entities('node').filter((e) => e.system === system);
  return {
    title: system,
    subtitle: `Gate · ${nodes.length} systems`,
    counts: [
      ['done today', t.done],
      ['in progress', t.inProgress],
      ['queued', t.queued],
    ],
    share: `${percent(ledger.systemShare(system))} of everything done on the grid today`,
    breakdown: nodes.map((n) => [n.name, ledger.tally(n.id).done] as [string, number]).sort((a, b) => b[1] - a[1]),
  };
}

/** The review gate's card: how much it reviewed today, how much went green, and the last few verdicts. */
export function reviewCard(stats: ReviewStats, waiting: number): CardModel {
  const rate = stats.reviewed ? Math.round((stats.confirmed / stats.reviewed) * 100) : 100;
  return {
    title: 'Review',
    subtitle: 'Gate · every finished request',
    counts: [
      ['reviewed', stats.reviewed],
      ['confirmed', stats.confirmed],
      ['denied', stats.denied],
    ],
    share: `${rate}% confirmed${waiting ? ` · ${waiting} waiting` : ''}`,
    recent: stats.recent,
    recentLabel: 'Latest verdicts',
  };
}

function counts(ledger: WorkLedger, id: string, doneLabel: string): Pick<CardModel, 'counts' | 'items' | 'more' | 'recent'> {
  const t = ledger.tally(id);
  return {
    recent: t.recent,
    counts: [
      [doneLabel, t.done],
      ['in progress', t.inProgress],
      ['queued', t.queued],
    ],
    items: t.items.slice(0, LIST),
    more: Math.max(0, t.items.length - LIST),
  };
}

/**
 * Hover cards on the grid: point at a node, an agent, a sub-agent or a gate
 * and a card beside the pointer shows its volume of work, refreshing while
 * you look. Lives alongside the gate/node line hover (hoverLines). Returns a
 * function that detaches it.
 */
export function hoverCards(stage: Stage, targets: () => HoverTarget[], card = new HoverCard()): () => void {
  const canvas = stage.renderer.domElement;
  let pointer: { x: number; y: number } | null = null;
  let current: HoverTarget | null = null;
  let since = 0;

  const find = (x: number, y: number): HoverTarget | null => {
    const list = targets().filter((t) => isShown(t.object));
    const hit = stage.pick(
      x,
      y,
      list.map((t) => t.object),
    );
    if (!hit) return null;
    for (let o: Object3D | null = hit.object; o; o = o.parent) {
      const target = list.find((t) => t.object === o);
      if (target) return target;
    }
    return null;
  };
  const render = () => {
    if (current && pointer) card.show(current.card(), pointer.x, pointer.y);
    else card.hide();
  };
  const onMove = (e: PointerEvent) => {
    pointer = { x: e.clientX, y: e.clientY };
    current = find(e.clientX, e.clientY);
    render();
  };
  const onLeave = () => {
    pointer = current = null;
    render();
  };
  const untick = stage.onTick((dt) => {
    since += dt / Math.max(stage.timeScale, 1e-3);
    if (since < REFRESH || !current) return;
    since = 0;
    // The thing under the pointer may have left (a sub-agent went home).
    if (!isShown(current.object)) current = null;
    render();
  });
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  return () => {
    untick();
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerleave', onLeave);
    card.dispose();
  };
}

/** In the scene and visible all the way up. */
function isShown(object: Object3D): boolean {
  let attached = false;
  for (let o: Object3D | null = object; o; o = o.parent) {
    if (!o.visible) return false;
    if (o.type === 'Scene') attached = true;
  }
  return attached;
}
