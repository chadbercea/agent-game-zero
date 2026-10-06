/** What a hover card says about the thing under the pointer. */
export interface CardModel {
  title: string;
  /** What it is: "System node", "Agent", "Sub-agent of D3V1N", "Gate · 3 systems". */
  subtitle: string;
  /** Headline counts, e.g. [['done today', 142], ['in progress', 9], ['queued', 23]]. */
  counts: readonly [string, number][];
  /** Its part of the whole, already worded: "11% of all work done today". */
  share?: string;
  /** What's under way now (a few), and how many more beyond those. */
  items?: readonly { key: string; title: string }[];
  more?: number;
  worksWith?: readonly string[];
  /** For a whole system: each part and how much it's done, e.g. [['Jira', 142], ['Confluence', 98]]. */
  breakdown?: readonly [string, number][];
}

const STYLE = `
.hover-card {
  position: fixed; z-index: 10; pointer-events: none; user-select: none;
  min-width: 210px; max-width: 280px; padding: 10px 12px 11px;
  font: 12px/1.35 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  color: #f1f2f4; background: rgba(28,29,33,0.94); border-radius: 8px;
  box-shadow: 0 6px 24px rgba(0,0,0,0.18);
  opacity: 0; transform: translateY(4px); transition: opacity 120ms, transform 120ms;
}
.hover-card.on { opacity: 1; transform: none; }
.hover-card h4 { margin: 0; font-size: 13px; font-weight: 600; letter-spacing: 0.01em; }
.hover-card .sub { color: #9a9ca4; margin-top: 1px; }
.hover-card .counts { display: flex; gap: 14px; margin-top: 8px; }
.hover-card .counts b { display: block; font-size: 16px; font-weight: 600; font-variant-numeric: tabular-nums; }
.hover-card .counts span { color: #9a9ca4; font-size: 11px; }
.hover-card .share { margin-top: 6px; color: #c9cbd1; }
.hover-card .label { margin-top: 9px; color: #9a9ca4; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
.hover-card ul { margin: 3px 0 0; padding: 0; list-style: none; }
.hover-card li { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hover-card li .key { color: #9a9ca4; font-variant-numeric: tabular-nums; margin-right: 6px; }
.hover-card .more { color: #9a9ca4; }
.hover-card li .num { display: inline-block; min-width: 4ch; text-align: right; margin-right: 8px; color: #9a9ca4; font-variant-numeric: tabular-nums; }
`;

let styled = false;

/**
 * A small dark card that follows the pointer and describes what's under it:
 * counts, its share of the whole, what's under way, who it works with.
 * Plain DOM over the canvas; it never takes the pointer.
 */
export class HoverCard {
  readonly element = document.createElement('div');
  private shown = false;

  constructor(parent: HTMLElement = document.body) {
    if (!styled) {
      const style = document.createElement('style');
      style.textContent = STYLE;
      document.head.append(style);
      styled = true;
    }
    this.element.className = 'hover-card';
    parent.append(this.element);
  }

  /** Fill the card with `model` and place it beside the pointer, kept inside the window. */
  show(model: CardModel, clientX: number, clientY: number): void {
    this.element.replaceChildren(...render(model));
    this.shown = true;
    this.element.classList.add('on');
    const pad = 14;
    const { offsetWidth: w, offsetHeight: h } = this.element;
    const x = clientX + pad + w > window.innerWidth ? clientX - pad - w : clientX + pad;
    const y = Math.min(Math.max(8, clientY + pad), window.innerHeight - h - 8);
    this.element.style.left = `${Math.max(8, x)}px`;
    this.element.style.top = `${y}px`;
  }

  hide(): void {
    if (!this.shown) return;
    this.shown = false;
    this.element.classList.remove('on');
  }

  get visible(): boolean {
    return this.shown;
  }

  dispose(): void {
    this.element.remove();
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function render(m: CardModel): HTMLElement[] {
  const out: HTMLElement[] = [el('h4', undefined, m.title), el('div', 'sub', m.subtitle)];
  const counts = el('div', 'counts');
  for (const [label, value] of m.counts) {
    const cell = el('div');
    cell.append(el('b', undefined, value.toLocaleString('en-US')), el('span', undefined, label));
    counts.append(cell);
  }
  out.push(counts);
  if (m.share) out.push(el('div', 'share', m.share));
  if (m.items?.length) {
    out.push(el('div', 'label', 'Under way'));
    const list = el('ul');
    for (const item of m.items) {
      const li = el('li');
      li.append(el('span', 'key', item.key), document.createTextNode(item.title));
      list.append(li);
    }
    if (m.more) list.append(el('li', 'more', `and ${m.more} more`));
    out.push(list);
  }
  if (m.breakdown?.length) {
    out.push(el('div', 'label', 'By system'));
    const list = el('ul');
    for (const [name, value] of m.breakdown) {
      const li = el('li');
      li.append(el('span', 'num', value.toLocaleString('en-US')), document.createTextNode(name));
      list.append(li);
    }
    out.push(list);
  }
  if (m.worksWith?.length) {
    out.push(el('div', 'label', 'Works with'));
    out.push(el('div', undefined, m.worksWith.join(', ')));
  }
  return out;
}
