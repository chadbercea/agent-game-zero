import type { Meta, StoryObj } from '@storybook/html-vite';
import { Vector3 } from 'three';
import { GateAnimator } from '../animation/GateAnimator';
import { Gate } from '../primitives/gate/Gate';
import { HoverCard } from '../stage/HoverCard';
import { specimenStage } from '../stage/specimen';
import { hoverCards, reviewCard } from './hoverCards';
import { DEMO_1, WorkLedger } from './ledger';
import { Review } from './review';
import { wait } from './timeline';

const meta: Meta = {
  title: 'Story/13 Review',
  parameters: { layout: 'fullscreen' },
};
export default meta;

const MAIN = new Vector3(0, 0, -1.25);
const SPOT = new Vector3(0, 0, 1.25);

function scene() {
  const { root, stage } = specimenStage({ viewSize: 5, focusY: 0.3 });
  const main = new Gate({ state: 'open' });
  main.position.copy(MAIN);
  const animator = new GateAnimator(main);
  stage.add(main);
  stage.onTick((dt) => animator.update(dt));
  const ledger = new WorkLedger(3);
  const review = new Review(stage, SPOT, MAIN, ledger, 3);
  review.visible = review.open = true;
  hoverCards(stage, () => [{ object: review.gate, card: () => reviewCard(review.summary(), review.waiting) }], new HoverCard(root));
  return { root, stage, review };
}

const caption = (root: HTMLElement) => {
  const el = document.createElement('div');
  Object.assign(el.style, { position: 'absolute', left: '16px', bottom: '16px', font: '14px ui-sans-serif, system-ui, sans-serif', color: '#3a3b40' });
  root.append(el);
  return (text: string) => (el.textContent = text);
};

/** Review at volume: finished requests keep coming, one product at a time rides in; most go green, now and then one is denied. Hover the gate. */
export const AtVolume: StoryObj = {
  render: () => {
    const { root, stage, review } = scene();
    const kinds = ['figma', 'github', 'notion', 'confluence', 'jira', 'bitbucket', 'codesearch'] as const;
    let n = 0;
    void (async () => {
      for (;;) {
        void review.submit({ key: `DEMO-${500 + n}`, title: 'A request' }, kinds[n % kinds.length]);
        n++;
        await wait(stage, 0.9 + (n % 3) * 0.4);
      }
    })();
    return root;
  },
};

/** Both outcomes, one after the other: DEMO-1 denied, then DEMO-1 confirmed. Loops. */
export const BothOutcomes: StoryObj = {
  render: () => {
    const { root, stage, review } = scene();
    const say = caption(root);
    void (async () => {
      for (;;) {
        say(`${DEMO_1.key} at review…`);
        await review.submit(DEMO_1, 'github', 'denied');
        say(`${DEMO_1.key} denied: missing context`);
        await wait(stage, 2);
        say(`${DEMO_1.key} at review…`);
        await review.submit(DEMO_1, 'bitbucket', 'confirmed');
        say(`${DEMO_1.key} confirmed`);
        await wait(stage, 2);
      }
    })();
    return root;
  },
};
