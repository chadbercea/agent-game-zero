import type { Color, Curve, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { LINEAGE, NEUTRAL } from '../core/palette';
import type { Drone } from '../primitives/drone/Drone';
import { GRAPH_COLOR } from '../primitives/graph/GraphEdge';
import { SYSTEM_NAME, type SystemKind } from '../primitives/node/emblems';
import type { SystemNode } from '../primitives/node/SystemNode';
import { PRODUCT_NAME, type Product } from '../primitives/product/Product';
import type { Ticket } from '../primitives/ticket/Ticket';
import { type Inspectable, lineHit } from '../stage/Inspector';
import {
  agentCard,
  gateCard,
  gatewayCard,
  lineCard,
  nodeCard,
  productCard,
  ticketCard,
} from '../stage/inspectCards';
import type { OneTicket } from './oneTicket';
import type { OneTicketB } from './oneTicketB';
import type { OneTicketFull } from './oneTicketFull';
import { TEAMWORK_LINKS } from './systemLayout';

const THIRD_PARTY = "D3V1N's tools";
const ATLASSIAN = 'Atlassian';

/**
 * Everything in the one-ticket story you can inspect (ILI-970), for the
 * shared Inspector: gates, tools, agents, lines, tickets, products and the
 * gateway, each with its own card. Read fresh on every pointer move, so it
 * always matches what's on the grid.
 */
export function oneTicketInspectables(full: OneTicketFull): () => Inspectable[] {
  const hits = new Map<object, Mesh>();
  const hitFor = (key: object, curve: Curve<Vector3>) => {
    let hit = hits.get(key);
    if (!hit) {
      hit = lineHit(curve);
      hits.set(key, hit);
    }
    return hit;
  };
  return () => [...versionA(full.a, hitFor), ...versionB(full.b, hitFor)];
}

type HitFor = (key: object, curve: Curve<Vector3>) => Mesh;

function versionA(a: OneTicket, hitFor: HitFor): Inspectable[] {
  const out: Inspectable[] = [];
  for (const stop of a.stops) {
    out.push({
      kind: 'gate',
      object: stop.gate,
      card: () => gateCard({ system: `${SYSTEM_NAME[stop.kind]} gate`, state: stop.gate.state, tools: [SYSTEM_NAME[stop.kind]] }),
    });
    out.push(node(stop.node, THIRD_PARTY));
  }
  out.push(agent(a.drone, () => carriedNames(a.carried, a.plan.visible)));
  out.push(ticket(a.ticket, 'Linear', 'D3V1N', () => (a.link.visible ? ['PRD in Notion'] : [])));
  out.push(ticket(a.prd, 'Notion', undefined, () => (a.prdLink.visible ? ['Design in Figma'] : [])));
  out.push(ticket(a.pr, 'GitHub', 'D3V1N', () => ['ILI-990']));
  out.push(line(a.branch, hitFor(a.branch, a.branch.curve), 'Branch', 'GitHub', 'D3V1N’s branch', NEUTRAL.packet, () => a.branch.drawn, 'Commits'));
  out.push(...products(a.carried, 'D3V1N'), ...products(a.commits, undefined));
  out.push(plan(a.plan, 'D3V1N'));
  return out;
}

function versionB(b: OneTicketB, hitFor: HitFor): Inspectable[] {
  const out: Inspectable[] = [];
  out.push({
    kind: 'gateway',
    object: b.gateway,
    card: () =>
      gatewayCard({
        sides: ["D3V1N's side", ATLASSIAN],
        secured: b.gateway.lockDrop >= 1,
        flowing: b.gateway.conduit.streams > 0,
        crossings: b.crossings,
      }),
  });
  for (const n of b.nodes.values()) out.push(node(n, ATLASSIAN));
  out.push(agent(b.drone, () => carriedNames(b.carried, b.plan.visible)));
  out.push(agent(b.rovo.drone, () => []));
  out.push(ticket(b.ticket, 'Jira', 'D3V1N', () => (b.record.visible ? ['Branch', 'Commits', 'PR'] : [])));
  out.push(ticket(b.pr, 'Bitbucket', 'D3V1N', () => ['DEMO-990']));
  for (const l of b.lines) {
    const from = l.from === 'gateway' ? 'Gateway' : SYSTEM_NAME[l.from];
    out.push(line(l.edge, hitFor(l.edge, l.edge.path), 'Graph link', from, SYSTEM_NAME[l.to], GRAPH_COLOR, () => l.edge.drawn, 'Work products, both ways'));
  }
  out.push(line(b.recordLine, hitFor(b.recordLine, b.recordLine.path), 'Record link', 'PR', 'DEMO-990', GRAPH_COLOR, () => b.recordLine.drawn, 'The PR, branch and commits'));
  out.push(line(b.branch, hitFor(b.branch, b.branch.curve), 'Branch', 'Bitbucket', 'D3V1N’s branch', NEUTRAL.packet, () => b.branch.drawn, 'Commits'));
  out.push(...products(b.carried, 'D3V1N'), ...products(b.commits, undefined));
  out.push(plan(b.plan, 'D3V1N'));
  return out;
}

function node(n: SystemNode, system: string): Inspectable {
  const linked = TEAMWORK_LINKS.flatMap((l) => (l.a === n.kind ? [l.b] : l.b === n.kind ? [l.a] : []));
  return {
    kind: 'node',
    object: n,
    card: () => nodeCard({ name: SYSTEM_NAME[n.kind], system, light: n.light, makes: PRODUCT_NAME[n.kind], linked: linked.map((k: SystemKind) => SYSTEM_NAME[k]) }),
  };
}

function agent(drone: Drone, carrying: () => string[]): Inspectable {
  return {
    kind: 'agent',
    object: drone,
    card: () => agentCard({ name: drone.name, lineage: drone.lineage, status: drone.status, carrying: carrying(), crew: [] }),
  };
}

function ticket(t: Ticket, system: string, assignee: string | undefined, links: () => string[]): Inspectable {
  return {
    kind: 'ticket',
    object: t,
    card: () => ticketCard({ key: t.request.key, title: t.request.title, system, assignee, links: links() }),
  };
}

function line(
  object: { material: MeshBasicMaterial },
  hit: Mesh,
  type: string,
  from: string,
  to: string,
  color: Color,
  drawn: () => number,
  carries: string,
): Inspectable {
  const base = object.material.color.clone();
  // The hit tube rides with the line (same parent), so it's only findable while the line is on the grid.
  const line = object as unknown as Mesh;
  if (!hit.parent) line.add(hit);
  return {
    kind: 'line',
    object: line,
    hit,
    card: () => lineCard({ type, from, to, color, drawn: drawn(), carries }),
    highlight: (on) => object.material.color.copy(on ? LINEAGE.cyan : base),
  };
}

function products(list: Product[], heldBy: string | undefined): Inspectable[] {
  return list.map((p) => ({
    kind: 'product',
    object: p,
    card: () => productCard({ name: PRODUCT_NAME[p.kind], from: SYSTEM_NAME[p.kind], heldBy }),
  }));
}

function plan(mesh: Mesh, heldBy: string): Inspectable {
  return { kind: 'product', object: mesh, card: () => productCard({ name: 'Plan', from: 'Everything it gathered, merged', heldBy }) };
}

function carriedNames(carried: Product[], planned: boolean): string[] {
  return planned ? ['Plan'] : carried.map((p) => `${PRODUCT_NAME[p.kind]} (${SYSTEM_NAME[p.kind]})`);
}
