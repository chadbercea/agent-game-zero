import { type Curve, type Mesh, type MeshStandardMaterial, Vector3 } from 'three';
import { NEUTRAL } from '../core/palette';
import { Assembler, BIG_BLOCK, LITTLE_BLOCK } from '../primitives/assembler/Assembler';
import { Branch } from '../primitives/branch/Branch';
import { BELT_TOP, Conveyor } from '../primitives/conveyor/Conveyor';
import { PORTAL_CENTER_Y, Portal } from '../primitives/portal/Portal';
import { Packet } from '../primitives/packet/Packet';
import type { SceneHost } from '../stage/Stage';
import { tween, wait } from './timeline';

export type ShipOutputStep = 'line' | 'shipping';

/** World units per second a little block rides the output line. */
const BLOCK_SPEED = 3.2;
/** At most this many little blocks on the line at once; past that, commits wait their turn. */
const MAX_ON_LINE = 6;
/** How long a block takes to drop off the assembler onto the belt, and to go through the portal. */
const DROP_SECONDS = 0.5;
const THROUGH_SECONDS = 0.45;

/** Where the output line goes: its route from GitHub to the assembler, and where the belt and the portal sit. */
export interface OutputPlace {
  route: Curve<Vector3>;
  assembler: Vector3;
  /** The belt runs along +x from here for `beltLength`. */
  beltFrom: Vector3;
  beltLength: number;
  /** How fast the belt runs, world units per second (the Conveyor's own pace if left out). */
  beltSpeed?: number;
  portal: Vector3;
}

/** The output line's parts on the grid. */
export interface OutputLine {
  line: Branch;
  assembler: Assembler;
  conveyor: Conveyor;
  portal: Portal;
  /** A commit just landed in GitHub: send a little block down the line (if there's room). */
  commit: () => void;
  stop: () => void;
}

/**
 * Beat 5 of the reworked story: the output.
 *
 * An output line draws from GitHub to an assembler; a conveyor belt and a
 * portal appear beside it, and the portal opens. From then on every commit
 * that lands in GitHub sends a little block down the line; at the assembler
 * little blocks click into a 2 × 2 × 2 set and fuse into a bigger block,
 * which drops onto the belt, rides it, and goes through the portal into
 * another realm (where it leads isn't shown). Steady, on its own. No captions.
 */
export async function shipOutput(
  stage: SceneHost,
  output: OutputPlace,
  onStep: (step: ShipOutputStep) => void = () => {},
): Promise<OutputLine> {
  const { route } = output;
  const line = new Branch(route, NEUTRAL.packet);
  line.drawn = 0;
  const assembler = new Assembler();
  assembler.position.copy(output.assembler);
  const conveyor = new Conveyor(output.beltLength);
  conveyor.position.copy(output.beltFrom);
  if (output.beltSpeed) conveyor.speed = output.beltSpeed;
  const portal = new Portal();
  portal.position.copy(output.portal);
  for (const part of [assembler, conveyor, portal]) part.scale.setScalar(0.001);
  stage.add(line, assembler, conveyor, portal);
  const untickParts = stage.onTick((dt) => {
    assembler.update(dt);
    conveyor.update(dt);
    portal.update(dt);
  });

  // The line draws out from GitHub; the assembler, the belt and the portal pop in; the portal opens.
  onStep('line');
  await tween(stage, 1, (t) => (line.drawn = 1 - (1 - t) ** 3));
  await Promise.all(
    [assembler, conveyor, portal].map(async (part, i) => {
      await wait(stage, i * 0.25);
      await tween(stage, 0.45, (t) => part.scale.setScalar(Math.max(0.001, t + Math.sin(t * Math.PI) * 0.15)));
    }),
  );
  await tween(stage, 0.8, (t) => (portal.open = t));

  // Shipping: little blocks down the line, bigger blocks along the belt and through the portal.
  onStep('shipping');
  let onLine = 0;
  let running = true;
  const length = route.getLength();
  const commit = () => {
    if (!running || onLine >= MAX_ON_LINE || assembler.count + onLine >= 8) return;
    onLine++;
    const packet = new Packet();
    packet.trail.visible = false;
    packet.cube.scale.setScalar(LITTLE_BLOCK / 0.2);
    stage.add(packet);
    const at = new Vector3();
    void tween(stage, length / BLOCK_SPEED, (t) => {
      route.getPointAt(t, at);
      packet.cube.position.set(at.x, 0.2, at.z);
    }).then(async () => {
      // Hop up into its slot on the assembler.
      const from = packet.cube.position.clone();
      const to = assembler.nextSlot();
      await tween(stage, 0.25, (t) => {
        packet.cube.position.lerpVectors(from, to, t);
        packet.cube.position.y += Math.sin(t * Math.PI) * 0.25;
      });
      packet.dispose();
      onLine--;
      if (running) assembler.addBlock();
    });
  };
  const shipping: Mesh[] = [];
  const untickShip = stage.onTick(() => {
    if (!running || !assembler.ready) return;
    const block = assembler.take();
    if (block) void ship(stage, block, conveyor, portal, shipping);
  });
  return {
    line,
    assembler,
    conveyor,
    portal,
    commit,
    stop: () => {
      running = false;
      untickParts();
      untickShip();
      for (const b of shipping.splice(0)) b.removeFromParent();
      for (const part of [line, assembler, conveyor, portal]) part.removeFromParent();
    },
  };
}

/** A bigger block drops onto the belt, rides it to the end, and goes through the portal. */
async function ship(stage: SceneHost, block: Mesh, conveyor: Conveyor, portal: Portal, shipping: Mesh[]): Promise<void> {
  stage.add(block);
  shipping.push(block);
  const half = BIG_BLOCK / 2;
  const from = block.position.clone();
  const onBelt = conveyor.pointAt(0.03).setY(BELT_TOP + half);
  await tween(stage, DROP_SECONDS, (t) => {
    block.position.lerpVectors(from, onBelt, t);
    block.position.y += Math.sin(t * Math.PI) * 0.3;
  });
  // Ride the belt at its speed.
  const at = new Vector3();
  await tween(stage, (conveyor.length * 0.94) / conveyor.speed, (t) => {
    conveyor.pointAt(0.03 + t * 0.94, at);
    block.position.set(at.x, BELT_TOP + half, at.z);
  });
  // Into the portal: it slides into the middle of the ring, shrinks away, and the portal flashes.
  const start = block.position.clone();
  const into = portal.position.clone().setY(PORTAL_CENTER_Y);
  await tween(stage, THROUGH_SECONDS, (t) => {
    block.position.lerpVectors(start, into, t);
    block.scale.setScalar(Math.max(0.001, 1 - t));
  });
  portal.gulp();
  block.removeFromParent();
  (block.material as MeshStandardMaterial).dispose();
  shipping.splice(shipping.indexOf(block), 1);
}
