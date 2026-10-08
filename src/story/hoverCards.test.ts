import { describe, expect, it } from 'vitest';
import { gateCard } from './hoverCards';
import { type Entity, WorkLedger } from './ledger';

const NODES: Entity[] = [
  { id: 'node:figma', kind: 'node', name: 'Figma', system: 'Tools' },
  { id: 'node:github', kind: 'node', name: 'GitHub', system: 'Tools' },
  { id: 'node:notion', kind: 'node', name: 'Notion', system: 'Tools' },
  { id: 'node:jira', kind: 'node', name: 'Jira', system: 'Atlassian' },
];

function ledger(): WorkLedger {
  const l = new WorkLedger(7);
  for (const e of NODES) l.register(e);
  return l;
}

describe('gateCard', () => {
  it('lists every tool in its system when nothing says which are on the grid', () => {
    const card = gateCard(ledger(), 'Tools');
    expect(card.breakdown!.map(([name]) => name).sort()).toEqual(['Figma', 'GitHub', 'Notion']);
    expect(card.subtitle).toBe('Gate · 3 systems');
  });

  it('lists and counts only the tools on the grid', () => {
    const l = ledger();
    const card = gateCard(l, 'Tools', (id) => id === 'node:github');
    expect(card.breakdown).toEqual([['GitHub', l.tally('node:github').done]]);
    expect(card.subtitle).toBe('Gate · 1 system');
    const github = l.tally('node:github');
    expect(card.counts).toEqual([
      ['done today', github.done],
      ['in progress', github.inProgress],
      ['queued', github.queued],
    ]);
  });

  it('shows an empty system before any tool is called', () => {
    const card = gateCard(ledger(), 'Tools', () => false);
    expect(card.breakdown).toEqual([]);
    expect(card.counts!.map(([, n]) => n)).toEqual([0, 0, 0]);
  });
});
