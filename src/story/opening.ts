import { MathUtils, Vector3 } from 'three';
import { DroneFlight } from '../animation/DroneFlight';
import type { Cloud } from '../primitives/cloud/Cloud';
import type { Drone } from '../primitives/drone/Drone';
import { type Hand, MAX_REACH, WAVE } from '../primitives/hand/Hand';
import { TICKET_CARD_H, TICKET_HOVER, type Ticket } from '../primitives/ticket/Ticket';
import type { SceneHost } from '../stage/Stage';
import { fly, tween, wait } from './timeline';

/** What the opening needs on stage: the cloud with its hand, the ticket it brings, and D3V1N. */
export interface OpeningCast {
  cloud: Cloud;
  hand: Hand;
  ticket: Ticket;
  drone: Drone;
}

/** Where the opening happens: the ticket's spot on the floor, how high the cloud floats, and D3V1N's way in. */
export interface OpeningPlaces {
  spot: Vector3;
  cloudHeight: number;
  droneFrom: Vector3;
  droneTo: Vector3;
}

export type OpeningStep = 'cloud' | 'handoff' | 'cloud-gone' | 'drone';

const MATERIALIZE_SECONDS = 1.1;
const REACH_SECONDS = 1.6;
const LET_GO_SECONDS = 0.35;
const WAVE_SECONDS = 1.1;
const RETRACT_SECONDS = 0.7;
const VANISH_SECONDS = 0.8;
/** D3V1N floats in slowly: a drift, not a dash. */
const FLOAT_SPEED = 2.4;

const socket = new Vector3();
const scale = new Vector3();

/**
 * The opening beat: a low-poly cloud materializes over the grid, a hand
 * reaches down out of it holding a Jira ticket, sets it down and lets go,
 * waves, and pulls back up. The cloud pops away, and D3V1N floats in to the
 * ticket and flashes (it's noticed it). Reads without captions; `onStep`
 * names each moment for whoever wants to caption it.
 *
 * Expects the hand attached to the cloud's hand point, and the ticket and
 * drone already on stage (both are shown here; D3V1N fades in as it comes).
 */
export async function opening(
  stage: SceneHost,
  { cloud, hand, ticket, drone }: OpeningCast,
  { spot, cloudHeight, droneFrom, droneTo }: OpeningPlaces,
  onStep: (step: OpeningStep) => void = () => {},
): Promise<void> {
  // Set the scene: nothing yet but the grid.
  cloud.position.set(spot.x, cloudHeight, spot.z);
  cloud.materialized = 0;
  cloud.visible = true;
  hand.reach = 0;
  hand.grip = 1;
  hand.wave = 0;
  ticket.visible = false;
  ticket.opacity = 1;
  drone.visible = false;
  drone.position.copy(droneFrom);
  drone.fade = 0;

  // The cloud pops into being.
  onStep('cloud');
  await tween(stage, MATERIALIZE_SECONDS, (t) => (cloud.materialized = t));
  await wait(stage, 0.3);

  // The hand reaches down with the ticket, held by its top edge, and stops with it at hover height.
  onStep('handoff');
  const holdAt = TICKET_HOVER + (TICKET_CARD_H * ticket.scale.y) / 2;
  const untickHold = stage.onTick(() => {
    hand.socket.getWorldPosition(socket);
    ticket.position.set(socket.x, 0, socket.z);
    ticket.card.position.y = (socket.y - (TICKET_CARD_H * ticket.scale.y) / 2) / ticket.scale.y;
  });
  // Its name tag shows once it's let go, so it doesn't sit over the hand.
  if (ticket.label) ticket.label.visible = false;
  ticket.visible = true;
  // How far to reach so the held point stops at `holdAt`, in the hand's own units (it may be scaled).
  hand.getWorldPosition(socket);
  const k = hand.getWorldScale(scale).y;
  const below = hand.depth - hand.reach * MAX_REACH;
  const reachTo = MathUtils.clamp(((socket.y - holdAt) / k - below) / MAX_REACH, 0, 1);
  await tween(stage, REACH_SECONDS, (t) => (hand.reach = reachTo * easeOutBack(t)));
  await wait(stage, 0.25);

  // Let go: the fingers open and the ticket stays, floating where it was put.
  untickHold();
  await tween(stage, LET_GO_SECONDS, (t) => (hand.grip = 1 - t));
  if (ticket.label) ticket.label.visible = true;
  ticket.glow = 0.6;
  await wait(stage, 0.2);

  // A little wave, then back up into the cloud.
  await tween(stage, WAVE_SECONDS, (t) => (hand.wave = Math.sin(t * Math.PI * 4) * WAVE * (1 - t * 0.3)));
  hand.wave = 0;
  await tween(stage, RETRACT_SECONDS, (t) => (hand.reach = reachTo * (1 - t * t)));

  // The cloud pops away.
  await tween(stage, VANISH_SECONDS, (t) => (cloud.materialized = 1 - t));
  cloud.visible = false;
  onStep('cloud-gone');
  await wait(stage, 0.4);

  // In floats D3V1N, to the ticket. It notices it.
  onStep('drone');
  drone.visible = true;
  const flight = DroneFlight.to(drone, droneTo, { speed: FLOAT_SPEED });
  const fadeIn = tween(stage, 0.8, (t) => (drone.fade = t));
  await Promise.all([fly(stage, flight), fadeIn]);
  drone.flash = 1;
  ticket.glow = 0.8;
}

/** Overshoot a touch past the end, then settle: the hand's reach lands with a little bounce. */
function easeOutBack(t: number): number {
  const c = 1.3;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}
