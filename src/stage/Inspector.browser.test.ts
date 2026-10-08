import { Group, Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { type Inspectable, Inspector } from './Inspector';
import {
  agentCard,
  gateCard,
  gatewayCard,
  lineCard,
  nodeCard,
  productCard,
  subAgentCard,
  ticketCard,
} from './inspectCards';
import type { Stage } from './Stage';
import { NEUTRAL } from '../core/palette';

/** A stand-in stage: a canvas to point at, and a pick that returns whatever the test says is under the pointer. */
function fakeStage() {
  const canvas = document.createElement('canvas');
  document.body.append(canvas);
  let under: Object3D | null = null;
  const stage = {
    renderer: { domElement: canvas },
    add: () => {},
    pick: () => (under ? { object: under } : undefined),
  } as unknown as Stage;
  const point = (o: Object3D | null) => {
    under = o;
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 10, clientY: 10 }));
  };
  const click = (o: Object3D | null) => {
    under = o;
    canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: 10, clientY: 10 }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: 10, clientY: 10 }));
  };
  return { stage, point, click };
}

function item(kind: Inspectable['kind'], text: string, lit: string[]): Inspectable {
  const object = new Group();
  object.add(new Object3D());
  return { kind, object, card: () => Object.assign(document.createElement('div'), { textContent: text }), highlight: (on) => on && lit.push(text) };
}

describe('Inspector', () => {
  it('hover highlights only; click opens the panel; another click swaps; empty floor or Escape closes', () => {
    const { stage, point, click } = fakeStage();
    const lit: string[] = [];
    const a = item('gate', 'Gate A', lit);
    const b = item('node', 'Node B', lit);
    const inspector = new Inspector(stage, () => [a, b]);
    const panel = inspector.panel.element;

    point(a.object.children[0]);
    expect(inspector.hovered).toBe(a);
    expect(lit).toEqual(['Gate A']);
    expect(inspector.panel.visible).toBe(false);

    click(a.object);
    expect(inspector.selected).toBe(a);
    expect(inspector.panel.visible).toBe(true);
    expect(panel.textContent).toContain('Gate A');

    // Pointing elsewhere doesn't touch the panel.
    point(b.object);
    expect(panel.textContent).toContain('Gate A');

    click(b.object);
    expect(inspector.selected).toBe(b);
    expect(panel.textContent).toContain('Node B');
    expect(panel.textContent).not.toContain('Gate A');

    click(null);
    expect(inspector.selected).toBeNull();
    expect(inspector.panel.visible).toBe(false);

    click(a.object);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(inspector.panel.visible).toBe(false);

    click(a.object);
    (panel.querySelector('.close') as HTMLButtonElement).click();
    expect(inspector.panel.visible).toBe(false);
    inspector.dispose();
  });

  it('a drag is not a click: the panel stays as it was', () => {
    const { stage } = fakeStage();
    const a = item('gate', 'Gate A', []);
    const inspector = new Inspector(stage, () => [a]);
    const canvas = stage.renderer.domElement;
    canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: 0, clientY: 0 }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: 60, clientY: 40 }));
    expect(inspector.selected).toBeNull();
    inspector.dispose();
  });

  it('things not on the grid (hidden) cannot be hovered or opened', () => {
    const { stage, point, click } = fakeStage();
    const a = item('gate', 'Gate A', []);
    a.object.visible = false;
    const inspector = new Inspector(stage, () => [a]);
    point(a.object);
    click(a.object);
    expect(inspector.hovered).toBeNull();
    expect(inspector.selected).toBeNull();
    inspector.dispose();
  });
});

describe('inspect cards', () => {
  it('every kind has its own card: its own layout, not one template with fields swapped', () => {
    const cards = [
      gateCard({ system: 'Gate', state: 'open', tools: ['Jira'] }),
      nodeCard({ name: 'Jira', system: 'Atlassian', light: 'working', makes: 'Issue', linked: ['Confluence'] }),
      agentCard({ name: 'D3V1N', lineage: 'blue', status: 'working', carrying: ['Issue'], crew: [] }),
      subAgentCard({ name: 'Rovo.1', parent: 'Rovo', lineage: 'cyan', status: 'working' }),
      lineCard({ type: 'Graph link', from: 'Jira', to: 'Confluence', color: NEUTRAL.packet, drawn: 1, carries: 'Specs' }),
      ticketCard({ key: 'DEMO-990', title: 'Add dark mode', system: 'Jira', links: [] }),
      productCard({ name: 'Design', from: 'Figma' }),
      gatewayCard({ sides: ['A', 'B'], secured: true, flowing: true, crossings: 2 }),
    ];
    // A card's shape: the sequence of element classes, top level down.
    const shape = (c: HTMLElement) =>
      [...c.querySelectorAll('*')].map((e) => `${e.tagName}.${e.className}`).join(' ');
    const shapes = new Set(cards.map(shape));
    expect(shapes.size).toBe(cards.length);
    expect(cards[0].textContent).toContain('Access granted');
    expect(cards[5].querySelector('.key')?.textContent).toBe('DEMO-990');
  });
});
