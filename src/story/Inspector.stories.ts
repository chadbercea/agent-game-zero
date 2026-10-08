import type { Meta, StoryObj } from '@storybook/html-vite';
import { LineCurve3, Vector3 } from 'three';
import { GateAnimator } from '../animation/GateAnimator';
import { BEND_RADIUS } from '../core/grid';
import { LINEAGE, NEUTRAL } from '../core/palette';
import { Branch } from '../primitives/branch/Branch';
import { roundedPath } from '../primitives/branch/gridPath';
import { Gate } from '../primitives/gate/Gate';
import { Gateway } from '../primitives/gateway/Gateway';
import { GRAPH_COLOR, GraphEdge } from '../primitives/graph/GraphEdge';
import { SystemNode } from '../primitives/node/SystemNode';
import { Product } from '../primitives/product/Product';
import { Ticket } from '../primitives/ticket/Ticket';
import { type Inspectable, Inspector, lineHit } from '../stage/Inspector';
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
import { specimenStage } from '../stage/specimen';
import { spawnDrone } from '../stage/spawnDrone';
import { wait } from './timeline';

const meta: Meta = {
  title: 'Story Parts/Inspector',
  parameters: { layout: 'fullscreen' },
};
export default meta;

/**
 * Inspect anything (ILI-970): one of each kind of thing on a small grid (a
 * gate, a tool, an agent, a sub-agent, an access branch, a graph link, a
 * ticket, a work product and the secure gateway). Hover highlights it; click
 * opens its card in the panel on the right (each kind has its own card);
 * click another to swap; click empty floor, the × or Escape to close. With
 * `demo` on, it walks through hover, open, swap and close by itself.
 */
export const OneOfEach: StoryObj<{ demo: boolean }> = {
  args: { demo: false },
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 11, focusY: 0.6 });
    stage.centerOn(new Vector3(1, 0.6, 0));

    const gate = new Gate({ state: 'open' });
    gate.position.set(-2, 0, 2);
    const gateAnimator = new GateAnimator(gate);
    stage.onTick((dt) => gateAnimator.update(dt));
    const node = new SystemNode({ kind: 'jira' });
    node.position.set(1.5, 0, -1.5);
    node.light = 'working';
    const branch = new Branch(roundedPath([new Vector3(-1.2, 0, 2), new Vector3(1.5, 0, 2), new Vector3(1.5, 0, -1)], BEND_RADIUS), NEUTRAL.packet);
    const edge = new GraphEdge(new LineCurve3(new Vector3(2, 0, -1.5), new Vector3(5, 0, -1.5)));
    const confluence = new SystemNode({ kind: 'confluence' });
    confluence.position.set(5.5, 0, -1.5);
    const gateway = new Gateway({ along: 'z', from: 0.5, to: 3, low: 4, high: 5 });
    gateway.built = 1;
    gateway.lockDrop = 1;
    gateway.conduit.streams = 1;
    const ticket = new Ticket({ key: 'DEMO-990', title: 'Add dark mode' });
    ticket.position.set(-0.5, 0, -2.5);
    ticket.scale.setScalar(0.7);
    const product = new Product('figma');
    product.position.set(3.5, 0.4, 2.5);
    product.scale.setScalar(2);
    stage.add(gate, node, branch, edge, confluence, gateway, ticket, product);
    branch.drawn = 1;
    edge.drawn = 1;
    stage.onTick((dt) => {
      gateway.update(dt);
      ticket.update(dt);
      edge.update(dt);
    });
    const { drone } = spawnDrone(stage, -4, 0.5, { name: 'D3V1N', showLabel: true, status: 'working' });
    const { drone: sub } = spawnDrone(stage, 1.5, -1.5, { name: 'Rovo.1', lineage: 'cyan', subAgent: true, status: 'working' });
    const branchHit = lineHit(branch.curve);
    branch.add(branchHit);
    const edgeHit = lineHit(edge.path);
    edge.add(edgeHit);
    const branchColor = branch.material.color.clone();
    const edgeColor = edge.material.color.clone();

    const items: Inspectable[] = [
      { kind: 'gate', object: gate, card: () => gateCard({ system: "D3V1N's tools", state: gate.state, tools: ['Linear', 'Notion', 'Figma', 'GitHub'] }) },
      { kind: 'node', object: node, card: () => nodeCard({ name: 'Jira', system: 'Atlassian', light: node.light, makes: 'Issue', linked: ['Confluence', 'Bitbucket'] }) },
      { kind: 'node', object: confluence, card: () => nodeCard({ name: 'Confluence', system: 'Atlassian', light: confluence.light, makes: 'Spec', linked: ['Jira'] }) },
      { kind: 'agent', object: drone, card: () => agentCard({ name: 'D3V1N', lineage: drone.lineage, status: drone.status, carrying: ['Issue (Jira)', 'Spec (Confluence)'], crew: ['D3V1N.1'] }) },
      { kind: 'sub-agent', object: sub, card: () => subAgentCard({ name: 'Rovo.1', parent: 'Rovo', lineage: 'cyan', status: sub.status, at: 'Jira', holding: 'Issue' }) },
      {
        kind: 'line',
        object: branch,
        hit: branchHit,
        card: () => lineCard({ type: 'Access trace', from: 'Gate', to: 'Jira', color: NEUTRAL.packet, drawn: branch.drawn, carries: 'Agents getting to the tool' }),
        highlight: (on) => branch.material.color.copy(on ? LINEAGE.cyan : branchColor),
      },
      {
        kind: 'line',
        object: edge,
        hit: edgeHit,
        card: () => lineCard({ type: 'Graph link', from: 'Jira', to: 'Confluence', color: GRAPH_COLOR, drawn: edge.drawn, carries: 'Specs linked to issues' }),
        highlight: (on) => edge.material.color.copy(on ? LINEAGE.cyan : edgeColor),
      },
      { kind: 'ticket', object: ticket, card: () => ticketCard({ key: 'DEMO-990', title: 'Add dark mode', system: 'Jira', assignee: 'D3V1N', links: ['PRD', 'Design'] }) },
      { kind: 'product', object: product, card: () => productCard({ name: 'Design', from: 'Figma', heldBy: undefined }) },
      { kind: 'gateway', object: gateway, card: () => gatewayCard({ sides: ["D3V1N's side", 'Atlassian'], secured: true, flowing: true, crossings: 2 }) },
    ];
    const inspector = new Inspector(stage, () => items, root);
    Object.assign(window, { __inspector: inspector, __items: items });

    if (args.demo) {
      void (async () => {
        for (;;) {
          for (const pick of [items[0], items[3], items[5], items[7], items[9]]) {
            inspector.hover(pick);
            await wait(stage, 0.8);
            inspector.select(pick);
            await wait(stage, 1.6);
          }
          inspector.hover(null);
          inspector.select(null);
          await wait(stage, 1.2);
        }
      })();
    }
    return root;
  },
};
