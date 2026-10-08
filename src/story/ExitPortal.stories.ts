import type { Meta, StoryObj } from '@storybook/html-vite';
import { Mesh, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { BIG_BLOCK } from '../primitives/assembler/Assembler';
import { BELT_TOP, Conveyor } from '../primitives/conveyor/Conveyor';
import { CURRENCY_CODES, Currency, type CurrencyCode } from '../primitives/currency/Currency';
import type { SystemKind } from '../primitives/node/emblems';
import { SystemNode } from '../primitives/node/SystemNode';
import { PORTAL_CENTER_Y, Portal } from '../primitives/portal/Portal';
import { productMaterial } from '../primitives/product/Product';
import { rowPosition, specimenStage } from '../stage/specimen';
import { ExitLine, exitPlace } from './exitLine';
import { tween, wait } from './timeline';

const meta: Meta = {
  title: 'Story Parts/Exit Portal',
  parameters: { layout: 'fullscreen' },
};
export default meta;

/**
 * Cube in → machine → money out, on loop (ILI-975). A small system sits in
 * the middle. On one side, finished work rides a belt into the entrance
 * portal; on the opposite side of the system, the exit portal pushes it out
 * onto a second belt, through the little machine, and it rolls out as a
 * coin of a major currency (seeded RNG: `seed`), piling up at the end. No
 * captions.
 */
export const CubeToCurrency: StoryObj<{ seed: number }> = {
  argTypes: { seed: { control: { type: 'number', min: 1, step: 1 } } },
  args: { seed: 3 },
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 10, focusY: 0.5 });
    const center = new Vector3(0, 0, 0);
    stage.centerOn(center.clone().setY(0.5));
    ([['jira', -1, 0], ['bitbucket', 1, 0], ['confluence', 0, -1.5]] as [SystemKind, number, number][]).forEach(([kind, x, z]) => {
      const node = new SystemNode({ kind, showLabel: false });
      node.position.set(x, 0, z);
      stage.add(node);
    });
    // The entrance side: a belt running into the entrance portal, left of the system.
    const entrance = new Vector3(-3.5, 0, 0);
    const beltIn = new Conveyor(2.4);
    beltIn.position.set(entrance.x - 2.9, 0, entrance.z);
    const portalIn = new Portal();
    portalIn.position.copy(entrance);
    portalIn.open = 1;
    stage.add(beltIn, portalIn);
    // The exit side: opposite the entrance, through the system's center.
    const exit = new ExitLine(stage, exitPlace(center, entrance), args.seed);
    stage.onTick((dt) => {
      beltIn.update(dt);
      portalIn.update(dt);
    });
    Object.assign(window, { __story: exit });
    void (async () => {
      for (;;) {
        const cube = new Mesh(new RoundedBoxGeometry(BIG_BLOCK, BIG_BLOCK, BIG_BLOCK, 3, 0.05), productMaterial());
        stage.add(cube);
        const y = BELT_TOP + BIG_BLOCK / 2;
        const at = new Vector3();
        await tween(stage, (beltIn.length * 0.94) / beltIn.speed, (t) => {
          beltIn.pointAt(0.03 + t * 0.94, at);
          cube.position.set(at.x, y, at.z);
        });
        const start = cube.position.clone();
        await tween(stage, 0.45, (t) => {
          cube.position.lerpVectors(start, entrance.clone().setY(PORTAL_CENTER_Y), t);
          cube.scale.setScalar(Math.max(0.001, 1 - t));
        });
        portalIn.gulp();
        cube.removeFromParent();
        void exit.emerge();
        await wait(stage, 1.6);
      }
    })();
    return root;
  },
};

/** All ten denominations, side by side, slowly turning: the coins a cube can come out as. */
export const Denominations: StoryObj = {
  render: () => {
    const { root, stage } = specimenStage({ viewSize: 4, focusY: 0.3 });
    const coins = CURRENCY_CODES.map((code: CurrencyCode, i) => {
      const coin = new Currency(code);
      const { x, z } = rowPosition(i, CURRENCY_CODES.length, 0.62);
      coin.position.set(x, 0.3, z);
      stage.add(coin);
      return coin;
    });
    let t = 0;
    stage.onTick((dt) => {
      t += dt;
      coins.forEach((c, i) => (c.spin = Math.sin(t * 0.8 + i * 0.6) * 0.6));
    });
    return root;
  },
};
