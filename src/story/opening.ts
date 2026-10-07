import type { Vector3 } from 'three';
import { DroneFlight } from '../animation/DroneFlight';
import type { Cloud } from '../primitives/cloud/Cloud';
import type { Drone } from '../primitives/drone/Drone';
import type { Ticket } from '../primitives/ticket/Ticket';
import type { SceneHost } from '../stage/Stage';
import { cloudDrop } from './cloudDrop';
import { fly, tween, wait } from './timeline';

/** What the opening needs on stage: a cloud, the ticket it brings, and D3V1N. */
export interface OpeningCast {
  cloud: Cloud;
  ticket: Ticket;
  drone: Drone;
}

/** Where the opening happens: where the ticket lands, how high the cloud floats, and D3V1N's way in. */
export interface OpeningPlaces {
  spot: Vector3;
  cloudHeight: number;
  droneFrom: Vector3;
  droneTo: Vector3;
}

export type OpeningStep = 'cloud' | 'drone';

/** D3V1N floats in slowly: a drift, not a dash. */
const FLOAT_SPEED = 2.4;

/**
 * The opening beat: a low-poly cloud drifts across the sky and, passing over
 * D3V1N's spot, drops a Jira ticket (DEMO-1), which lands with a little
 * bounce and stays. The cloud drifts on and away. Then D3V1N floats in to
 * the ticket and flashes (it's noticed it). Reads without captions.
 */
export async function opening(
  stage: SceneHost,
  { cloud, ticket, drone }: OpeningCast,
  { spot, cloudHeight, droneFrom, droneTo }: OpeningPlaces,
  onStep: (step: OpeningStep) => void = () => {},
): Promise<void> {
  drone.visible = false;
  drone.position.copy(droneFrom);
  drone.fade = 0;

  // The cloud drifts over and drops the ticket; it stays where it fell.
  onStep('cloud');
  let landed = false;
  const drop = cloudDrop(stage, cloud, ticket, spot, { height: cloudHeight, tilt: -0.12, keep: true, onLand: () => (landed = true) });
  // D3V1N comes in as soon as the ticket is down; the cloud carries on out on its own.
  while (!landed) await wait(stage, 0.1);
  await wait(stage, 0.4);

  onStep('drone');
  drone.visible = true;
  const flight = DroneFlight.to(drone, droneTo, { speed: FLOAT_SPEED });
  await Promise.all([fly(stage, flight), tween(stage, 0.8, (t) => (drone.fade = t)), drop]);
  drone.flash = 1;
  ticket.glow = 0.8;
}

