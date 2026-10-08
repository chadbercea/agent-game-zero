import { Group, Mesh, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { seededRandom } from '../core/scatter';
import { BIG_BLOCK } from '../primitives/assembler/Assembler';
import { BELT_TOP, Conveyor } from '../primitives/conveyor/Conveyor';
import { COIN_RADIUS, Currency, type CurrencyCode, pickCurrency } from '../primitives/currency/Currency';
import { Minter } from '../primitives/minter/Minter';
import { PORTAL_CENTER_Y, Portal } from '../primitives/portal/Portal';
import { productMaterial } from '../primitives/product/Product';
import type { SceneHost } from '../stage/Stage';
import { tween } from './timeline';

/** The belt out of the exit portal starts this far in front of it… */
const BELT_FROM = 0.45;
/** …and the machine sits this far along it. */
const MINT_AT = 0.45;
/** Coins pile up at the end of the belt; past this many, the oldest go. */
const PILE_MAX = 6;
const OUT_SECONDS = 0.45;
const DROP_SECONDS = 0.35;

/** Where the exit side sits: the portal's floor point, and the way the belt runs out of it (along a grid axis). */
export interface ExitPlace {
  portal: Vector3;
  direction: Vector3;
  beltLength: number;
}

/**
 * Put the exit portal opposite the entrance (ILI-975): mirrored through the
 * system's center, so it's on the far side of whatever the system is, with
 * its belt running away from the system along the grid axis that points
 * most outward.
 */
export function exitPlace(center: Vector3, entrance: Vector3, beltLength = 3.2): ExitPlace {
  const portal = center.clone().multiplyScalar(2).sub(entrance).setY(0);
  const out = portal.clone().sub(center);
  const direction = Math.abs(out.x) >= Math.abs(out.z) ? new Vector3(Math.sign(out.x) || 1, 0, 0) : new Vector3(0, 0, Math.sign(out.z) || 1);
  return { portal, direction, beltLength };
}

/**
 * The output's other end (ILI-975): what went through the entrance portal
 * comes out here. The exit portal pushes the cube out onto a second belt,
 * which carries it into a little machine (the Minter); the machine stamps,
 * and out the far side rolls money: a coin of one of ten major currencies,
 * picked by seeded RNG. Coins pile up at the end of the belt. Reads as cube
 * in → machine → money out.
 */
export class ExitLine extends Group {
  readonly portal = new Portal();
  readonly conveyor: Conveyor;
  readonly minter = new Minter();
  /** Every coin minted, in order. */
  readonly minted: CurrencyCode[] = [];
  private readonly pile: Currency[] = [];
  private readonly random: () => number;
  private readonly untick: () => void;

  constructor(
    private readonly stage: SceneHost,
    place: ExitPlace,
    seed = 3,
  ) {
    super();
    this.random = seededRandom(seed);
    this.position.copy(place.portal);
    // Local +x runs along the belt, out of the portal.
    this.rotation.y = Math.atan2(-place.direction.z, place.direction.x);
    this.conveyor = new Conveyor(place.beltLength);
    this.conveyor.position.x = BELT_FROM;
    this.minter.position.x = BELT_FROM + place.beltLength * MINT_AT;
    this.portal.open = 1;
    this.add(this.portal, this.conveyor, this.minter);
    stage.add(this);
    this.untick = stage.onTick((dt) => {
      this.portal.update(dt);
      this.conveyor.update(dt);
      this.minter.update(dt);
      for (const coin of this.pile) coin.spin = Math.sin(performance.now() / 900 + coin.id) * 0.5;
    });
  }

  /** A cube comes through: out of the portal, along the belt, into the machine, out as money. Resolves with the currency. */
  async emerge(): Promise<CurrencyCode> {
    const { stage, conveyor, minter, portal } = this;
    const half = BIG_BLOCK / 2;
    const cube = new Mesh(new RoundedBoxGeometry(BIG_BLOCK, BIG_BLOCK, BIG_BLOCK, 3, 0.05), productMaterial());
    cube.castShadow = true;
    this.add(cube);
    // Out of the ring, growing back to size, and down onto the belt.
    portal.gulp();
    const mouth = new Vector3(0, PORTAL_CENTER_Y, 0);
    const onBelt = new Vector3(BELT_FROM + 0.1, BELT_TOP + half, 0);
    await tween(stage, OUT_SECONDS, (t) => {
      cube.position.lerpVectors(mouth, onBelt, t);
      cube.position.y += Math.sin(t * Math.PI) * 0.15;
      cube.scale.setScalar(Math.max(0.001, t));
    });
    // Ride into the machine.
    const into = minter.position.x;
    await this.ride(cube, onBelt.x, into, BELT_TOP + half);
    cube.removeFromParent();
    cube.geometry.dispose();
    cube.material.dispose();
    // Stamp: money comes out the far side.
    const code = pickCurrency(this.random);
    this.minted.push(code);
    minter.stamp();
    const coin = new Currency(code);
    coin.rotation.y = -this.rotation.y;
    coin.position.set(into, BELT_TOP + COIN_RADIUS, 0);
    this.add(coin);
    await this.ride(coin, into, BELT_FROM + conveyor.length - 0.1, BELT_TOP + COIN_RADIUS);
    // Off the end, onto the pile.
    const from = coin.position.clone();
    const slot = this.pile.length % PILE_MAX;
    const to = new Vector3(BELT_FROM + conveyor.length + 0.45, COIN_RADIUS, (slot - (PILE_MAX - 1) / 2) * 0.18);
    await tween(stage, DROP_SECONDS, (t) => {
      coin.position.lerpVectors(from, to, t);
      coin.position.y += Math.sin(t * Math.PI) * 0.2;
    });
    this.pile.push(coin);
    if (this.pile.length > PILE_MAX) {
      const old = this.pile.shift()!;
      void tween(stage, 0.3, (t) => old.scale.setScalar(Math.max(0.001, 1 - t))).then(() => old.dispose());
    }
    return code;
  }

  /** Carry something along the belt from x `a` to `b` at the belt's speed. */
  private ride(thing: Group | Mesh, a: number, b: number, y: number): Promise<void> {
    return tween(this.stage, Math.abs(b - a) / this.conveyor.speed, (t) => thing.position.set(a + (b - a) * t, y, 0));
  }

  dispose(): void {
    this.untick();
    for (const coin of this.pile.splice(0)) coin.dispose();
    this.portal.dispose();
    this.conveyor.dispose();
    this.minter.dispose();
    this.removeFromParent();
  }
}
