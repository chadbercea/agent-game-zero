import type { Curve, Mesh, Vector3 } from 'three';
import { NEUTRAL } from '../core/palette';
import { GRAPH_COLOR } from '../primitives/graph/GraphEdge';
import { SYSTEM_NAME, type SystemKind } from '../primitives/node/emblems';
import type { SystemNode } from '../primitives/node/SystemNode';
import { PRODUCT_NAME } from '../primitives/product/Product';
import { type Inspectable, lineHit } from '../stage/Inspector';
import {
  agentCard,
  gateCard,
  gatewayCard,
  lineCard,
  nodeCard,
  productCard,
  subAgentCard,
  ticketCard,
} from '../stage/inspectCards';
import type { RovoAtlassian } from './rovoAtlassian';
import { isTwg } from './rovoTasks';
import { TEAMWORK_LINKS } from './systemLayout';

const TWG = 'Teamwork Graph';
const CONNECTOR = 'Third-party, through a connector';

/**
 * Everything in Rovo on the Atlassian Grid you can hover and click (the
 * shared Inspector, ILI-970): the gate, Jira and the systems that are up,
 * Slack and its gateway, Rovo and each of its copies, every line, the
 * tickets copies hold, what's been written back, the terminals and the code
 * pipeline. Read fresh on every pointer move, so it always matches what's on
 * the grid right now (things come and go).
 */
export function rovoInspectables(scene: RovoAtlassian): () => Inspectable[] {
  const hits = new Map<object, Mesh>();
  const hitFor = (key: object, curve: Curve<Vector3>) => {
    let hit = hits.get(key);
    if (!hit) {
      hit = lineHit(curve);
      hits.set(key, hit);
    }
    return hit;
  };
  return () => {
    const out: Inspectable[] = [];
    const { hub, systems, slack } = scene;
    const shown = (o: { visible: boolean; scale: Vector3 }) => o.visible && o.scale.x > 0.05;

    // The gate, once it's up.
    if (shown(scene.gate)) {
      out.push({
        kind: 'gate',
        object: scene.gate,
        card: () => gateCard({ system: "Rovo's way into the Atlassian grid", state: scene.gate.state, tools: ['Jira', 'Confluence', 'Bitbucket'] }),
      });
    }

    // Jira, and every system that's up.
    if (shown(scene.jira)) out.push(node(scene.jira, TWG));
    for (const up of systems.placed.values()) {
      if (!shown(up.node)) continue;
      out.push(node(up.node, isTwg(up.kind) ? TWG : CONNECTOR));
      // What's been written back there.
      for (const p of up.writeBacks) {
        out.push({ kind: 'product', object: p, card: () => productCard({ name: PRODUCT_NAME[up.kind], from: SYSTEM_NAME[up.kind], heldBy: SYSTEM_NAME[up.kind] }) });
      }
      // Its line: to Jira, or into the system it hangs off.
      const edge = up.link?.edge ?? hub.ties.get(up.tie);
      if (edge && edge.drawn > 0.01) {
        const to = up.link ? SYSTEM_NAME[up.link.to] : 'Jira';
        out.push({
          kind: 'line',
          object: edge,
          hit: hitFor(edge, edge.path),
          card: () => lineCard({ type: 'Graph link', from: SYSTEM_NAME[up.kind], to, color: GRAPH_COLOR, drawn: edge.drawn, carries: 'Work and status, into the record' }),
        });
      }
    }

    // Slack and its gateway.
    if (shown(slack.node)) out.push(node(slack.node, 'Comms hub, on its own'));
    if (slack.gateway.visible && slack.gateway.built > 0.5) {
      out.push({
        kind: 'gateway',
        object: slack.gateway,
        card: () =>
          gatewayCard({ sides: ['Slack', 'Jira'], secured: slack.gateway.lockDrop >= 1, flowing: slack.gateway.conduit.streams > 0, crossings: slack.messages }),
      });
    }

    // Rovo, and its copies.
    const copies = [...scene.copies.keys()];
    out.push({
      kind: 'agent',
      object: scene.rovo.drone,
      card: () =>
        agentCard({
          name: 'Rovo',
          lineage: scene.rovo.drone.lineage,
          status: scene.rovo.drone.status,
          carrying: [],
          crew: copies.map((c) => c.name),
        }),
    });
    for (const [drone, held] of scene.copies) {
      out.push({
        kind: 'sub-agent',
        object: drone,
        card: () => {
          const at = scene.working.get(drone);
          return subAgentCard({
            name: drone.name,
            parent: 'Rovo',
            lineage: drone.lineage,
            status: drone.status,
            at: at ? placeName(at as SystemNode) : held.run ? 'On its way' : 'Waiting for its next ticket',
            holding: held.card ? `${held.card.request.key} · ${held.card.request.title}` : undefined,
          });
        },
      });
      // The ticket it holds.
      if (held.card) {
        const card = held.card;
        out.push({
          kind: 'ticket',
          object: card,
          card: () =>
            ticketCard({
              key: card.request.key,
              title: card.request.title,
              system: 'Jira',
              assignee: drone.name,
              links: held.run ? held.run.task.steps.map((s) => SYSTEM_NAME[s.system]) : [],
            }),
        });
      }
    }

    // Rovo's way in.
    if (scene.accessLine.drawn > 0.01) {
      const line = scene.accessLine;
      out.push({
        kind: 'line',
        object: line,
        hit: hitFor(line, line.curve),
        card: () => lineCard({ type: 'Access trace', from: 'Gate', to: 'Jira', color: NEUTRAL.packet, drawn: line.drawn, carries: "Rovo's access" }),
      });
    }

    // The code lanes: worktree, terminal, and their lines into the repo.
    for (const lane of scene.lanes) {
      if (!lane) continue;
      if (shown(lane.worktree)) out.push(node(lane.worktree, 'A checkout of the repo'));
      if (shown(lane.terminal)) {
        out.push({
          kind: 'node',
          object: lane.terminal,
          card: () => nodeCard({ name: 'Terminal', system: 'Coding lane', light: lane.terminal.state === 'off' ? 'off' : 'working', makes: terminalDoing(lane.terminal.state, lane.terminal.passed), linked: ['Worktree', 'Bitbucket'] }),
        });
      }
      for (const [line, from, to, carries] of [
        [lane.toTerminal, 'Worktree', 'Terminal', 'The code change'],
        [lane.toRepo, 'Terminal', 'Bitbucket', 'The check-in'],
      ] as const) {
        if (line.drawn < 0.01) continue;
        out.push({ kind: 'line', object: line, hit: hitFor(line, line.curve), card: () => lineCard({ type: 'Branch', from, to, color: NEUTRAL.packet, drawn: line.drawn, carries }) });
      }
    }

    // The user's terminal, and an MCP client while one is up.
    for (const [terminal, name, what] of [
      [scene.terminal, "User's terminal", 'Updates back to the user'],
      [scene.mcpTerminal, 'MCP client', 'Figma, through MCP'],
    ] as const) {
      if (!terminal || !shown(terminal)) continue;
      out.push({
        kind: 'node',
        object: terminal,
        card: () => nodeCard({ name, system: 'Terminal', light: terminal.passed ? 'working' : 'off', makes: what, linked: name === 'MCP client' ? ['Figma'] : ['Jira'] }),
      });
    }

    // The code pipeline: out of the repo, built, shipped through the portal.
    const output = scene.output;
    if (output) {
      out.push({
        kind: 'line',
        object: output.line,
        hit: hitFor(output.line, output.line.curve),
        card: () => lineCard({ type: 'Deploy', from: 'Bitbucket', to: 'Assembler', color: NEUTRAL.packet, drawn: output.line.drawn, carries: 'Merged code, small and fast' }),
      });
      out.push({
        kind: 'node',
        object: output.assembler,
        card: () => nodeCard({ name: 'Assembler', system: 'Deploy', light: output.assembler.count > 0 ? 'working' : 'off', makes: 'A release (eight merges in one)', linked: ['Bitbucket', 'Portal'] }),
      });
      out.push({
        kind: 'node',
        object: output.portal,
        card: () => nodeCard({ name: 'Portal', system: 'Deploy', light: 'working', makes: 'Shipped: out to production', linked: ['Assembler'] }),
      });
    }
    return out;
  };
}

function node(n: SystemNode, system: string): Inspectable {
  const linked = TEAMWORK_LINKS.flatMap((l) => (l.a === n.kind ? [l.b] : l.b === n.kind ? [l.a] : []));
  return {
    kind: 'node',
    object: n,
    card: () =>
      nodeCard({ name: SYSTEM_NAME[n.kind], system, light: n.light, makes: PRODUCT_NAME[n.kind], linked: linked.map((k: SystemKind) => SYSTEM_NAME[k]) }),
  };
}

/** Where a copy is working, in words. */
function placeName(at: SystemNode): string {
  return 'kind' in at && at.kind ? SYSTEM_NAME[at.kind] : 'A terminal';
}

function terminalDoing(state: string, passed: boolean): string {
  if (passed) return 'CI passed';
  return state === 'admin' ? 'Setting up the worktree' : state === 'diff' ? 'Writing the code (diff)' : state === 'tail' ? 'CI/CD, tailing the logs' : 'Idle';
}
