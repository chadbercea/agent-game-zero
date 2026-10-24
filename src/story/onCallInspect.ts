import { NEUTRAL } from '../core/palette';
import { type Inspectable, lineHit } from '../stage/Inspector';
import { gatewayCard, lineCard, nodeCard } from '../stage/inspectCards';
import type { Mesh } from 'three';
import type { RovoOnCall } from './rovoOnCall';
import { rovoInspectables } from './rovoInspect';

/**
 * Everything in Rovo on Call you can hover and click: all of the grid's
 * (rovoInspectables), plus production past the portal: each service, its
 * replicas, and the lines between them.
 */
export function onCallInspectables(scene: RovoOnCall): () => Inspectable[] {
  const grid = rovoInspectables(scene);
  const hits = new Map<object, Mesh>();
  return () => {
    const { production, incident } = scene;
    const out = grid();
    const names = incident.services.map((s) => s.name);
    const shown = (o: { visible: boolean; scale: { x: number } }) => o.visible && o.scale.x > 0.05;
    // The glass tunnel into production, and the production server past it.
    if (production.tunnel.visible && production.tunnel.built > 0.5) {
      out.push({
        kind: 'gateway',
        object: production.tunnel,
        card: () => gatewayCard({ sides: ['Assembler', 'Production server'], secured: production.tunnel.lockDrop >= 1, flowing: production.tunnel.conduit.streams > 0, crossings: production.delivered }),
      });
    }
    if (shown(production.server)) {
      out.push({
        kind: 'node',
        object: production.server,
        card: () => nodeCard(production.serverFacts()),
      });
    }
    for (const [line, from, to, carries] of [
      [production.intoServer, 'Glass tunnel', 'Production server', 'Releases'],
      [production.toFront, 'Production server', names[0], 'Requests, and releases on their way in'],
    ] as const) {
      if (line.drawn < 0.01) continue;
      let hit = hits.get(line);
      if (!hit) hits.set(line, (hit = lineHit(line.curve)));
      out.push({ kind: 'line', object: line, hit, card: () => lineCard({ type: 'Deploy', from, to, color: NEUTRAL.packet, drawn: line.drawn, carries }) });
    }
    production.nodes.forEach((node, i) => {
      if (shown(node)) out.push({ kind: 'node', object: node, card: () => nodeCard(production.serviceFacts(i)) });
    });
    for (const r of production.replicas) if (shown(r.node)) out.push({ kind: 'node', object: r.node, card: () => nodeCard(production.replicaFacts(r)) });
    for (const d of production.dependencies) {
      if (d.line.drawn < 0.01) continue;
      let hit = hits.get(d);
      if (!hit) hits.set(d, (hit = lineHit(d.line.curve)));
      out.push({
        kind: 'line',
        object: d.line,
        hit,
        card: () => lineCard({ type: 'Dependency', from: names[d.from], to: names[d.to], color: NEUTRAL.packet, drawn: d.line.drawn, carries: 'Requests, and releases on their way in' }),
      });
    }
    return out;
  };
}
