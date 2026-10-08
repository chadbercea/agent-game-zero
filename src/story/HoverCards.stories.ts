import type { Meta, StoryObj } from '@storybook/html-vite';
import { SYSTEM_NAME } from '../primitives/node/emblems';
import { HoverCard } from '../stage/HoverCard';
import { agentCard, gateCard, nodeCard } from './hoverCards';
import { DEMO_1, WorkLedger } from './ledger';
import { ATLASSIAN, D3V1N_ID, nodeId, subId, TOOLS } from './volume';

const meta: Meta = {
  title: 'Story Parts/Hover Cards',
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
