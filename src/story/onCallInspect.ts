import { NEUTRAL } from '../core/palette';
import { type Inspectable, lineHit } from '../stage/Inspector';
import { lineCard, nodeCard } from '../stage/inspectCards';
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
    production.nodes.forEach((node, i) => {
      if (!shown(node)) return;
      const s = incident.services[i];
      out.push({
        kind: 'node',
        object: node,
        card: () => nodeCard({ name: s.name, system: 'Production service', light: node.light, makes: 'Requests', linked: s.calls.map((c) => names[c]) }),
      });
    });
    for (const r of production.replicas) {
      if (!shown(r.node)) continue;
      out.push({
        kind: 'node',
        object: r.node,
        card: () => nodeCard({ name: `${names[r.of]} replica`, system: 'Production service', light: r.node.light, makes: 'Requests', linked: [names[r.of]] }),
      });
    }
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
