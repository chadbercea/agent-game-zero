import type { Color } from 'three';
import { LINEAGE, type Lineage, STATUS_COLOR, type Status } from '../core/palette';
import type { GateState } from '../primitives/gate/Gate';
import type { NodeLight } from '../primitives/node/SystemNode';

/**
 * The cards in the inspect panel (ILI-970), one per kind of thing. Each is
 * laid out for what that kind is about, not one template with fields
 * swapped: a gate leads with its access state, a node with what it makes and
 * who it's linked to, an agent with what it carries and its crew, a line
 * draws its two ends, a ticket reads like a ticket, a gateway shows the two
 * sides it joins.
 */

const STYLE = `
.ic { display: grid; gap: 10px; }
.ic .eyebrow { color: #8a8c93; font-size: 10px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }
.ic h3 { margin: 0; font-size: 16px; font-weight: 650; letter-spacing: -0.005em; }
.ic .muted { color: #6b6e76; }
.ic .label { color: #8a8c93; font-size: 10px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 4px; }
.ic .pill { display: inline-flex; align-items: center; gap: 6px; padding: 3px 9px; border-radius: 999px; background: #f3f4f6; font-weight: 600; }
.ic .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.ic ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 3px; }
.ic li { display: flex; align-items: center; gap: 7px; }
.ic .chips { display: flex; flex-wrap: wrap; gap: 5px; }
.ic .chip { padding: 2px 8px; border: 1px solid #e3e4e8; border-radius: 6px; }
.ic .facts { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; }
.ic .facts dt { color: #8a8c93; }
.ic .facts dd { margin: 0; font-weight: 550; }
.ic .head { display: flex; align-items: center; gap: 10px; }
.ic .tile { width: 36px; height: 36px; border-radius: 8px; display: grid; place-items: center; font-weight: 700; flex: none; }
.ic .avatar { width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; color: #fff; font-weight: 700; flex: none; }
.ic .ends { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 8px; }
.ic .ends .rail { height: 0; border-top: 3px dotted currentColor; }
.ic .bar { height: 6px; border-radius: 3px; background: #eef0f3; overflow: hidden; }
.ic .bar > i { display: block; height: 100%; background: currentColor; }
.ic .key { font: 600 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace; padding: 4px 7px; border-radius: 5px; background: #1d1e22; color: #fff; justify-self: start; }
.ic .ticket { border: 1px solid #e3e4e8; border-radius: 8px; padding: 10px 12px; display: grid; gap: 6px; }
.ic .big { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
.ic .sides { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 8px; text-align: center; }
.ic .tube { padding: 6px 10px; border-radius: 6px; border: 1px solid #c9d3f5; background: #f3f6ff; color: #5b74d9; font-weight: 600; }
`;

let styled = false;
function style(): void {
  if (styled) return;
  const s = document.createElement('style');
  s.textContent = STYLE;
  document.head.append(s);
  styled = true;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function card(...children: (Node | null | false | undefined)[]): HTMLElement {
  style();
  const root = el('div', 'ic');
  for (const c of children) if (c) root.append(c);
  return root;
}

const hex = (c: Color) => `#${c.getHexString()}`;
const OFF = '#b8bac0';

function dot(color: string): HTMLElement {
  const d = el('span', 'dot');
  d.style.background = color;
  return d;
}

function pill(color: string, text: string): HTMLElement {
  const p = el('span', 'pill');
  p.append(dot(color), document.createTextNode(text));
  return p;
}

function section(label: string, body: Node): HTMLElement {
  const s = el('div');
  s.append(el('div', 'label', label), body);
  return s;
}

function facts(rows: [string, string][]): HTMLElement {
  const dl = el('dl', 'facts');
  dl.style.margin = '0';
  for (const [k, v] of rows) dl.append(el('dt', undefined, k), el('dd', undefined, v));
  return dl;
}

function chips(items: readonly string[], empty = 'none'): HTMLElement {
  const c = el('div', 'chips');
  if (!items.length) c.append(el('span', 'muted', empty));
  for (const i of items) c.append(el('span', 'chip', i));
  return c;
}

const STATUS_WORD: Record<Status, string> = { working: 'Working', waiting: 'Waiting', stopped: 'Stopped' };

// Gate ---------------------------------------------------------------------

export interface GateCardData {
  /** The system it lets into. */
  system: string;
  state: GateState;
  /** The tools behind it. */
  tools: readonly string[];
}

const GATE_WORD: Record<GateState, [string, string]> = {
  off: ['Closed', OFF],
  thinking: ['Checking access', hex(STATUS_COLOR.waiting)],
  open: ['Access granted', hex(STATUS_COLOR.working)],
  denied: ['Access denied', hex(STATUS_COLOR.stopped)],
};

/** A gate: whether it's letting anyone in right now, and what's behind it. */
export function gateCard(d: GateCardData): HTMLElement {
  const [word, color] = GATE_WORD[d.state];
  const list = el('ul');
  for (const t of d.tools) {
    const li = el('li');
    li.append(dot('#3a3b40'), document.createTextNode(t));
    list.append(li);
  }
  return card(el('div', 'eyebrow', 'Gate'), el('h3', undefined, d.system), pill(color, word), section(`Leads to · ${d.tools.length}`, list));
}

// Node ---------------------------------------------------------------------

export interface NodeCardData {
  name: string;
  /** Whose system it's in. */
  system: string;
  light: NodeLight;
  /** What it produces, in words ("Design", "Commit"). */
  makes: string;
  /** Systems the graph links it to. */
  linked: readonly string[];
}

/** A tool: its name up top, what it makes and whether anyone's working it, and what it's linked to. */
export function nodeCard(d: NodeCardData): HTMLElement {
  const head = el('div', 'head');
  const tile = el('div', 'tile', d.name.slice(0, 1));
  tile.style.background = '#f1f2f4';
  const titles = el('div');
  titles.append(el('div', 'eyebrow', 'Tool'), el('h3', undefined, d.name));
  head.append(tile, titles);
  const working = d.light === 'off' ? 'Idle' : `${STATUS_WORD[d.light]} now`;
  return card(
    head,
    facts([
      ['System', d.system],
      ['Makes', d.makes],
      ['Activity', working],
    ]),
    section('Linked on the graph', chips(d.linked, 'not linked')),
  );
}

// Agent --------------------------------------------------------------------

export interface AgentCardData {
  name: string;
  lineage: Lineage;
  status: Status;
  /** What it's carrying, bottom of the stack first. */
  carrying: readonly string[];
  /** Sub-agents it has out. */
  crew: readonly string[];
}

/** An agent: who it is (its lineage color), what it's doing, what it carries, and its crew. */
export function agentCard(d: AgentCardData): HTMLElement {
  const head = el('div', 'head');
  const avatar = el('div', 'avatar', d.name.slice(0, 1));
  avatar.style.background = hex(LINEAGE[d.lineage]);
  const titles = el('div');
  titles.append(el('div', 'eyebrow', 'Agent'), el('h3', undefined, d.name));
  head.append(avatar, titles);
  const stack = el('ul');
  if (!d.carrying.length) stack.append(el('li', 'muted', 'Empty-handed'));
  [...d.carrying].reverse().forEach((c) => {
    const li = el('li');
    li.append(dot('#6b6e76'), document.createTextNode(c));
    stack.append(li);
  });
  return card(
    head,
    pill(hex(STATUS_COLOR[d.status]), STATUS_WORD[d.status]),
    section(`Carrying · ${d.carrying.length}`, stack),
    section('Sub-agents out', chips(d.crew)),
  );
}

// Sub-agent ----------------------------------------------------------------

export interface SubAgentCardData {
  name: string;
  parent: string;
  lineage: Lineage;
  status: Status;
  /** Where it's working, if anywhere. */
  at?: string;
  /** What it's holding, if anything. */
  holding?: string;
}

/** A sub-agent: whose it is first (parent › itself), then where it is and what it holds. */
export function subAgentCard(d: SubAgentCardData): HTMLElement {
  const crumb = el('div', 'eyebrow');
  crumb.textContent = `Sub-agent of ${d.parent}`;
  const name = el('h3', undefined, d.name);
  name.style.color = hex(LINEAGE[d.lineage]);
  return card(
    crumb,
    name,
    pill(hex(STATUS_COLOR[d.status]), STATUS_WORD[d.status]),
    facts([
      ['Working at', d.at ?? 'on its way'],
      ['Holding', d.holding ?? 'nothing'],
    ]),
  );
}

// Line ---------------------------------------------------------------------

export interface LineCardData {
  /** What kind of line ("Access trace", "Graph link", "Branch", "Record link"). */
  type: string;
  from: string;
  to: string;
  color: Color;
  /** How much of it is drawn (0–1). */
  drawn: number;
  /** What travels on it, in words. */
  carries: string;
}

/** A line: its two ends, drawn as a line between them, how far it's drawn, and what rides it. */
export function lineCard(d: LineCardData): HTMLElement {
  const ends = el('div', 'ends');
  const rail = el('div', 'rail');
  ends.style.color = hex(d.color);
  ends.append(el('strong', undefined, d.from), rail, el('strong', undefined, d.to));
  for (const s of ends.querySelectorAll('strong')) (s as HTMLElement).style.color = '#1d1e22';
  const bar = el('div', 'bar');
  bar.style.color = hex(d.color);
  const fill = el('i');
  fill.style.width = `${Math.round(d.drawn * 100)}%`;
  bar.append(fill);
  return card(el('div', 'eyebrow', d.type), ends, section(`Drawn · ${Math.round(d.drawn * 100)}%`, bar), facts([['Carries', d.carries]]));
}

// Ticket -------------------------------------------------------------------

export interface TicketCardData {
  key: string;
  title: string;
  /** Where it lives ("Linear", "Jira", "Notion", "GitHub"). */
  system: string;
  assignee?: string;
  /** What it links to or has picked up. */
  links: readonly string[];
}

/** A ticket: read like one, key chip and title on a card, then where it lives and what it links. */
export function ticketCard(d: TicketCardData): HTMLElement {
  const t = el('div', 'ticket');
  t.append(el('span', 'key', d.key), el('h3', undefined, d.title));
  return card(
    el('div', 'eyebrow', `Ticket · ${d.system}`),
    t,
    facts([
      ['Lives in', d.system],
      ['Assigned to', d.assignee ?? 'nobody'],
    ]),
    section('Links', chips(d.links, 'no links yet')),
  );
}

// Product ------------------------------------------------------------------

export interface ProductCardData {
  /** What it is ("Design", "Issue", "Plan"). */
  name: string;
  /** Where it came from. */
  from: string;
  /** Who has it, if anyone. */
  heldBy?: string;
}

/** A work product: what it is, big, and its provenance (from where, held by whom). */
export function productCard(d: ProductCardData): HTMLElement {
  return card(
    el('div', 'eyebrow', 'Work product'),
    el('div', 'big', d.name),
    facts([
      ['From', d.from],
      ['Held by', d.heldBy ?? 'set down'],
    ]),
  );
}

// Gateway ------------------------------------------------------------------

export interface GatewayCardData {
  /** The two sides it joins. */
  sides: [string, string];
  secured: boolean;
  /** Data flowing through it now. */
  flowing: boolean;
  /** Agents through it so far this run. */
  crossings: number;
}

/** The secure gateway: the two sides it joins with the tunnel between, its lock, and its traffic. */
export function gatewayCard(d: GatewayCardData): HTMLElement {
  const sides = el('div', 'sides');
  sides.append(el('strong', undefined, d.sides[0]), el('span', 'tube', d.secured ? 'locked tunnel' : 'open tunnel'), el('strong', undefined, d.sides[1]));
  const crossings = el('div');
  crossings.append(el('div', 'big', String(d.crossings)), el('div', 'muted', 'crossings this run'));
  return card(
    el('div', 'eyebrow', 'Secure gateway'),
    sides,
    pill(d.secured ? hex(STATUS_COLOR.working) : OFF, d.secured ? 'Secured' : 'Not secured'),
    pill(d.flowing ? '#5b74d9' : OFF, d.flowing ? 'Data flowing' : 'Quiet'),
    crossings,
  );
}
