import type { Meta, StoryObj } from '@storybook/html-vite';
import { SYSTEM_NAME } from '../primitives/node/emblems';
import { HoverCard } from '../stage/HoverCard';
import { specimenStage } from '../stage/specimen';
import { agentCard, gateCard, hoverCards, nodeCard } from './hoverCards';
import { DEMO_1, WorkLedger } from './ledger';
import { STORY_CENTER } from './layout';
import { twoActScene } from './twoActs';
import { ATLASSIAN, D3V1N_ID, nodeId, subId, TOOLS, Volume } from './volume';

const meta: Meta = {
  title: 'Story/11 Hover Cards',
  parameters: { layout: 'fullscreen' },
};
export default meta;

/** One of each card, side by side: a node, an agent, a sub-agent and a gate, from one seeded ledger. */
export const Gallery: StoryObj = {
  render: () => {
    const root = document.createElement('div');
    Object.assign(root.style, { position: 'relative', height: '100vh', background: '#fff' });
    const ledger = new WorkLedger(4);
    for (const kind of ['figma', 'github', 'notion'] as const) {
      ledger.register({ id: nodeId(kind), kind: 'node', name: SYSTEM_NAME[kind], system: TOOLS });
    }
    for (const kind of ['codesearch', 'confluence', 'jira', 'bitbucket'] as const) {
      ledger.register({ id: nodeId(kind), kind: 'node', name: SYSTEM_NAME[kind], system: ATLASSIAN });
    }
    ledger.register({ id: D3V1N_ID, kind: 'agent', name: 'D3V1N', system: TOOLS });
    ledger.register({ id: 'agent:rovo', kind: 'agent', name: 'Rovo', system: ATLASSIAN });
    ledger.register({ id: subId('figma'), kind: 'sub-agent', name: 'Figma sub-agent', system: TOOLS });
    ledger.register({ id: subId('jira'), kind: 'sub-agent', name: 'Jira sub-agent', system: ATLASSIAN });
    ledger.assign(DEMO_1, [D3V1N_ID, nodeId('jira'), subId('figma')]);
    const cards = [
      nodeCard(ledger, nodeId('jira'), 'jira'),
      agentCard(ledger, D3V1N_ID, ['Figma sub-agent', 'GitHub sub-agent', 'Notion sub-agent']),
      agentCard(ledger, subId('figma'), ['D3V1N', 'Figma']),
      gateCard(ledger, ATLASSIAN),
    ];
    requestAnimationFrame(() =>
      cards.forEach((model, i) => new HoverCard(root).show(model, 10 + i * 310, 30)),
    );
    return root;
  },
};

/**
 * Live: both systems on the grid with volume ticking in the background.
 * Hover a gate, a node or D3V1N.
 */
export const Live: StoryObj = {
  render: () => {
    const { root, stage } = specimenStage({ viewSize: 18.5, focusY: 0 });
    stage.centerOn(STORY_CENTER);
    const scene = twoActScene(stage);
    scene.act1.map.showAll();
    scene.act2.map.showAll();
    const volume = new Volume(stage, scene, () => [{ id: D3V1N_ID, drone: scene.drone }]);
    const ledger = volume.ledger;
    hoverCards(
      stage,
      () => [
        { object: scene.act1.gate, card: () => gateCard(ledger, TOOLS) },
        { object: scene.act2.gate, card: () => gateCard(ledger, ATLASSIAN) },
        ...[...scene.act1.map.nodes, ...scene.act2.map.nodes].map((node) => ({
          object: node,
          card: () => nodeCard(ledger, nodeId(node.kind), node.kind),
        })),
        { object: scene.drone, card: () => agentCard(ledger, D3V1N_ID, []) },
      ],
      new HoverCard(root),
    );
    return root;
  },
};
