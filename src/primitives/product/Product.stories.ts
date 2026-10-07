import type { Meta, StoryObj } from '@storybook/html-vite';
import { LineCurve3, Vector3 } from 'three';
import { makeLabel } from '../../core/label';
import { rowPosition, SCREEN_RIGHT, specimenStage } from '../../stage/specimen';
import { shoot } from '../../story/beam';
import { wait } from '../../story/timeline';
import { SYSTEM_NAME } from '../node/emblems';
import { PRODUCT_KINDS, PRODUCT_NAME, Product } from './Product';

const meta: Meta = {
  title: 'Primitives/Product',
  parameters: { layout: 'fullscreen' },
};
export default meta;

/** Every system's work product, side by side, named: told apart by shape, all one neutral gray. */
export const All: StoryObj = {
  render: () => {
    const { root, stage } = specimenStage({ viewSize: 4, focusY: 0.3 });
    PRODUCT_KINDS.forEach((kind, i) => {
      const { x, z } = rowPosition(i, PRODUCT_KINDS.length, 0.62);
      const product = new Product(kind);
      product.position.set(x, 0.3, z);
      product.scale.setScalar(1.6);
      const label = makeLabel(`${SYSTEM_NAME[kind]} · ${PRODUCT_NAME[kind]}`);
      label.element.style.fontSize = '10px';
      label.position.y = (i % 2 ? -0.3 : 0.32) / 1.6;
      product.add(label);
      stage.add(product);
    });
    return root;
  },
};

/** Each product riding a line the way work moves on the grid: upright, facing the camera, one after another. */
export const Riding: StoryObj = {
  render: () => {
    const { root, stage } = specimenStage({ viewSize: 5, focusY: 0.2 });
    const half = SCREEN_RIGHT.clone().multiplyScalar(2.2);
    const line = new LineCurve3(new Vector3().sub(half), half.clone());
    void (async () => {
      for (;;) {
        for (const kind of PRODUCT_KINDS) {
          void shoot(stage, line, 1.6, undefined, kind);
          await wait(stage, 0.7);
        }
        await wait(stage, 2);
      }
    })();
    return root;
  },
};
