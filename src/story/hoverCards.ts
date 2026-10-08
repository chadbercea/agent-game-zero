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

/**
 * A gate's card: the collective volume of its system, node by node. With
 * `onGrid`, only the nodes it accepts (the tools agents have called up so
 * far) are listed and counted; otherwise every node in the system is.
 */
export function gateCard(ledger: WorkLedger, system: string, onGrid?: (nodeId: string) => boolean): CardModel {
  const nodes = ledger.entities('node').filter((e) => e.system === system && (!onGrid || onGrid(e.id)));
  const t = { done: 0, inProgress: 0, queued: 0 };
  for (const n of nodes) {
    const { done, inProgress, queued } = ledger.tally(n.id);
    t.done += done;
    t.inProgress += inProgress;
    t.queued += queued;
  }
  const all = ledger.totals('node').done;
  return {
    title: system,
    subtitle: `Gate · ${nodes.length} ${nodes.length === 1 ? 'system' : 'systems'}`,
    counts: [
      ['done today', t.done],
      ['in progress', t.inProgress],
      ['queued', t.queued],
    ],
    share: `${percent(all > 0 ? t.done / all : 0)} of everything done on the grid today`,
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

/** Lighting a request's trail from its line on a card (optional; the live story passes none). */
export interface TraceHooks {
  /** Which requests have a trail to show (their lines on cards are underlined). */
  traceable?: (key: string) => boolean;
  /** Show this request's trail, or none. */
  trace?: (key: string | null) => void;
}

/** How long a card stays up after the pointer leaves its object, so the pointer can reach it. */
const GRACE_MS = 350;
/** Around an open card, this much margin counts as heading into it: the card holds, whatever is underneath. */
const CORRIDOR = 24;

/**
 * Hover cards on the grid: point at a node, an agent, a sub-agent or a gate
 * and a card beside the pointer shows its volume of work, refreshing while
 * you look. The card stays where it opened and can be pointed into: a
 * traceable request's line lights its trail on the grid (`hooks.trace`), and
 * clicking it pins the trail until it's clicked again. Lives alongside the
 * gate/node line hover (hoverLines). Returns a function that detaches it.
 */
export function hoverCards(
  stage: Stage,
  targets: () => HoverTarget[],
  card = new HoverCard(),
  hooks: TraceHooks = {},
): () => void {
  const canvas = stage.renderer.domElement;
  let pointer: { x: number; y: number } | null = null;
  let current: HoverTarget | null = null;
  let anchor = { x: 0, y: 0 };
  let overCard = false;
  let hoverKey: string | null = null;
  let pinnedKey: string | null = null;
  let leaveTimer: ReturnType<typeof setTimeout> | undefined;
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
  const mark = (items?: CardModel['items']) =>
    items?.map((i) => (hooks.traceable?.(i.key) ? { ...i, traceable: true, pinned: i.key === pinnedKey } : i));
  const render = () => {
    if (!current) return card.hide();
    const model = current.card();
    card.show({ ...model, items: mark(model.items), recent: mark(model.recent) }, anchor.x, anchor.y);
  };
  const applyTrace = () => hooks.trace?.(hoverKey ?? pinnedKey);
  const cancelLeave = () => clearTimeout(leaveTimer);
  const leaveSoon = () => {
    cancelLeave();
    leaveTimer = setTimeout(() => {
      if (overCard) return;
      current = null;
      render();
    }, GRACE_MS);
  };

  const nearCard = (x: number, y: number) => {
    if (!card.visible) return false;
    const r = card.element.getBoundingClientRect();
    return x > r.left - CORRIDOR && x < r.right + CORRIDOR && y > r.top - CORRIDOR && y < r.bottom + CORRIDOR;
  };
  const onMove = (e: PointerEvent) => {
    pointer = { x: e.clientX, y: e.clientY };
    // Heading into the open card: keep it, even across other things on the grid.
    if (current && nearCard(e.clientX, e.clientY)) return cancelLeave();
    const target = find(e.clientX, e.clientY);
    if (target) {
      cancelLeave();
      if (target !== current) {
        current = target;
        anchor = { ...pointer };
      }
      render();
    } else if (current) leaveSoon();
  };
  const onCanvasLeave = (e: PointerEvent) => {
    if (e.relatedTarget instanceof Node && card.element.contains(e.relatedTarget)) return;
    pointer = null;
    leaveSoon();
  };
  const keyAt = (e: Event) => (e.target as HTMLElement).closest<HTMLElement>('[data-key]')?.dataset.key ?? null;
  const onCardEnter = () => {
    overCard = true;
    cancelLeave();
  };
  const onCardMove = (e: PointerEvent) => {
    const key = keyAt(e);
    if (key === hoverKey) return;
    hoverKey = key;
    applyTrace();
  };
  const onCardLeave = () => {
    overCard = false;
    hoverKey = null;
    applyTrace();
    leaveSoon();
  };
  const onCardClick = (e: MouseEvent) => {
    const key = keyAt(e);
    if (!key) return;
    pinnedKey = pinnedKey === key ? null : key;
    render();
    applyTrace();
  };

  const untick = stage.onTick((dt) => {
    since += dt / Math.max(stage.timeScale, 1e-3);
    if (since < REFRESH || !current) return;
    since = 0;
    // The thing under the pointer may have left (a sub-agent went home).
    if (!isShown(current.object) && !overCard) current = null;
    // Hold the card still while the pointer is in it, so its lines don't move under the pointer.
    if (!overCard) render();
  });
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onCanvasLeave);
  card.element.addEventListener('pointerenter', onCardEnter);
  card.element.addEventListener('pointermove', onCardMove);
  card.element.addEventListener('pointerleave', onCardLeave);
  card.element.addEventListener('click', onCardClick);
  return () => {
    untick();
    cancelLeave();
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerleave', onCanvasLeave);
    hooks.trace?.(null);
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
