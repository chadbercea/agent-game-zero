import { Vector3 } from 'three';
import { unitBorder } from '../core/floor';
import { gatewayUnit } from '../core/floor';
import { GATE_FOOTPRINT, NODE_FOOTPRINT } from '../core/grid';
import type { Gateway } from '../primitives/gateway/Gateway';
import type { Gate } from '../primitives/gate/Gate';
import { GATE_TITLE, type GateCardData, type GatewayCardData, gateRows, gatewayRows, gateToolsLabel } from '../stage/inspectCards';
import { GATEWAY_WIDTH } from './storyMap';
import { trimPolyline } from '../primitives/branch/gridPath';
import type { SystemNode } from '../primitives/node/SystemNode';
import { GroundPanel, type GroundPanelData } from '../primitives/unit/GroundPanel';
import type { FloorRect, GatewaySide, PanelDirection } from '../primitives/unit/unitLayout';

/**
 * Grounded units in the stories (ILI-1073): every node gets its ground panel,
 * lying the way the story's map chose, and every line that ends at a node
 * ends on its unit's border.
 */

/** The border round a node standing at `at`, `fullScale` its size once up, its panel lying `way`. */
export function borderAt(at: Vector3, fullScale: number, way: PanelDirection): FloorRect {
  return unitBorder({ at, size: NODE_FOOTPRINT * fullScale }, way);
}

/** Give `node` (made with `showLabel: false`) its ground panel, lying `way`, showing `data`. */
export function groundPanel(node: SystemNode, way: PanelDirection, fullScale: number, data: () => GroundPanelData): GroundPanel {
  return new GroundPanel(node, { direction: way, fullScale, data });
}

const within = (p: Vector3, r: FloorRect) => p.x > r.minX + 1e-6 && p.x < r.maxX - 1e-6 && p.z > r.minZ + 1e-6 && p.z < r.maxZ - 1e-6;

/** `points` from where they first leave `rect` (they start inside it); unchanged if they start outside. */
function leaving(points: Vector3[], rect: FloorRect): Vector3[] {
  if (!within(points[0], rect)) return points;
  for (let i = 1; i < points.length; i++) {
    if (within(points[i], rect)) continue;
    const [a, b] = [points[i - 1], points[i]];
    // Where the segment crosses the border: the first side it passes.
    const t = Math.min(
      b.x > rect.maxX ? (rect.maxX - a.x) / (b.x - a.x) : b.x < rect.minX ? (rect.minX - a.x) / (b.x - a.x) : 1,
      b.z > rect.maxZ ? (rect.maxZ - a.z) / (b.z - a.z) : b.z < rect.minZ ? (rect.minZ - a.z) / (b.z - a.z) : 1,
    );
    return [a.clone().lerp(b, t), ...points.slice(i).map((p) => p.clone())];
  }
  return [points[points.length - 1].clone()];
}

/**
 * A line cut back at each end: to the border it starts or ends in (a
 * unit's), or by a fixed amount (something with no panel: a gate, a terminal).
 */
export function cutToBorders(points: Vector3[], from: FloorRect | number, to: FloorRect | number): Vector3[] {
  let line = points.map((p) => p.clone().setY(0));
  if (typeof from === 'number') line = trimPolyline(line, from, 0);
  else line = leaving(line, from);
  if (typeof to === 'number') line = trimPolyline(line, 0, to);
  else line = leaving([...line].reverse(), to).reverse();
  return line;
}

/** Which way each node's panel lies, by id (the story's map: StoryMap.panels). */
export type PanelWays = ReadonlyMap<string, PanelDirection>;

/** A node's id on the map: the repo goes by `scm` whichever it is; other systems by their kind. */
export function unitId(kind: string): string {
  return kind === 'github' || kind === 'bitbucket' || kind === 'gitlab' ? 'scm' : kind;
}

/** The border round node `id` standing at `at` (`fullScale` its size once up), or `otherwise` if the map gave it no panel. */
export function borderFor(ways: PanelWays, id: string, at: Vector3, fullScale: number, otherwise: number): FloorRect | number {
  const way = ways.get(id);
  return way ? borderAt(at, fullScale, way) : otherwise;
}

/** Give `node` its ground panel if the map gave it a way (`fullScale` its size once up). */
export function groundNode(ways: PanelWays, id: string, node: SystemNode, fullScale: number, data: () => GroundPanelData): void {
  const way = ways.get(id);
  if (way) groundPanel(node, way, fullScale, data);
}

/** Where lines leave the gate: its unit's border, or just off its pad if the map gave it no panel. */
export function gateEdge(ways: PanelWays, at: Vector3): FloorRect | number {
  const way = ways.get('gate');
  return way ? unitBorder({ at, size: GATE_FOOTPRINT }, way) : GATE_FOOTPRINT / 2 + 0.05;
}

/** Give the gate its ground panel, showing its card: the agent access check, how it's going, and the tools the agent is permitted. */
export function gatePanel(ways: PanelWays, gate: Gate, card: () => GateCardData): void {
  const way = ways.get('gate');
  if (!way) return;
  new GroundPanel(gate, {
    direction: way,
    nodeSize: GATE_FOOTPRINT,
    data: () => {
      const d = card();
      return {
        eyebrow: 'Gate',
        name: GATE_TITLE,
        system: '',
        light: 'off',
        makes: '',
        facts: gateRows(d),
        linkedLabel: gateToolsLabel(d),
        linked: d.tools,
      };
    },
  });
}

/** Give a secure gateway its ground panel, beside it on the floor on `side`, showing its card: what it joins, whether it's secured, its traffic. */
export function gatewayPanel(gateway: Gateway, side: GatewaySide, card: () => GatewayCardData): void {
  const { layout } = gatewayUnit(gateway.run, GATEWAY_WIDTH, side);
  new GroundPanel(gateway.ground, {
    direction: gateway.run.along === 'x' ? 'z' : 'x',
    layout,
    data: () => {
      const d = card();
      return {
        eyebrow: 'Gateway',
        name: 'Secure gateway',
        system: '',
        light: 'off',
        makes: '',
        facts: gatewayRows(d),
        linkedLabel: 'Joins',
        linked: d.sides,
      };
    },
  });
}
