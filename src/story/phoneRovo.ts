import { CurvePath, DoubleSide, Mesh, MeshBasicMaterial, RingGeometry, Vector3 } from 'three';
import { DroneFlight } from '../animation/DroneFlight';
import { inRun } from '../core/sharedRuns';
import { reversed } from '../primitives/branch/gridPath';
import { PhoneCall, RING_SECONDS } from '../primitives/call/PhoneCall';
import type { Charge } from '../primitives/charge/Charge';
import { type Drone, SUB_AGENT_SCALE } from '../primitives/drone/Drone';
import { GRAPH_COLOR } from '../primitives/graph/GraphEdge';
import { attachSignal } from '../stage/attachSignal';
import { spawnDrone } from '../stage/spawnDrone';
import type { SceneHost } from '../stage/Stage';
import { shoot } from './beam';
import { D3V1N_REACH, REWORK, type ReworkScene } from './rework';
import { fly, tween, wait } from './timeline';

export type PhoneRovoStep = 'call' | 'rovo' | 'graph' | 'secure' | 'juiced';

/** How high the call rides over the lines: about an agent's waist. */
const CALL_HEIGHT = 1.1;
const CALL_SPEED = 3.4;
/** Rings at Jira before the call goes out. */
const RINGS = 3;
/** The blue wave Rovo sends out across the grid: how far it reaches and how long it takes. */
const WAVE_REACH = 11;
const WAVE_SECONDS = 1.8;
/** Power packets that come through the gateway to D3V1N. */
const POWER_PACKETS = 4;
/** A sub-agent buds off its parent this small, and grows as it flies out. */
const BUD_SCALE = 0.25;

/**
 * Beat 3 of the reworked story: D3V1N phones Rovo through Jira.
 *
 * D3V1N keeps working at GitHub. A little phone handset pops out of it and
 * rides its lines to Jira, rings there, and goes out off the grid. Rovo
 * flies in from that way and settles over Jira. Rovo fires up the rest of
 * the Teamwork Graph: a blue wave spreads from Jira, each ghost tool comes
 * online as it's reached, and the graph's links draw in. Then Rovo secures
 * D3V1N's way in: it stays on Jira and sends a sub-agent, which builds the
 * glass gateway over D3V1N's line to Jira, drops the lock, and comes back to
 * dissolve into Rovo. Power flows through the gateway to D3V1N, which charges up
 * (it's juiced). No denial; D3V1N never stops working. Reads without captions.
 *
 * Expects Rovo on stage, hidden, and D3V1N's charge attached and off.
 * Returns a function that lets Rovo go from Jira (for resetting the scene).
 */
export async function phoneRovo(
  stage: SceneHost,
  { drone, rovo, charge, scene }: { drone: Drone; rovo: Drone; charge: Charge; scene: ReworkScene },
  onStep: (step: PhoneRovoStep) => void = () => {},
): Promise<() => void> {
  const { nodes, reach, graph, gateway } = scene;
  const jira = nodes.jira;

  // The call: out of D3V1N, along its own lines to Jira.
  onStep('call');
  const phone = new PhoneCall();
  stage.add(phone);
  const untickPhone = stage.onTick((dt) => phone.update(dt));
  const toJira = new CurvePath<Vector3>();
  toJira.add(reversed(reach.github!.route));
  toJira.add(reach.jira!.route);
  phone.ringing = 0.35;
  await ride(stage, phone, toJira, CALL_SPEED, (t) => (phone.scale.setScalar(Math.min(1, t * 8) * 2)));
  // It rings at Jira.
  phone.ringing = 1;
  jira.light = 'waiting';
  await wait(stage, RING_SECONDS * RINGS);
  // And goes out: up and away toward where Rovo will come from.
  const from = phone.position.clone();
  const away = REWORK.rovoFrom.clone().setY(6);
  await tween(stage, 1.1, (t) => {
    const e = t * t;
    phone.position.lerpVectors(from, away, e);
    phone.position.y += Math.sin(t * Math.PI) * 1.2;
    phone.opacity = 1 - Math.max(0, (t - 0.6) / 0.4);
  });
  untickPhone();
  phone.dispose();

  // Rovo answers: in it flies, to Jira, its home system.
  onStep('rovo');
  rovo.position.copy(REWORK.rovoFrom);
  rovo.visible = true;
  rovo.fade = 0;
  rovo.status = 'working';
  await Promise.all([
    fly(stage, DroneFlight.to(rovo, jira.position, { speed: 4.5 })),
    tween(stage, 0.8, (t) => (rovo.fade = t)),
  ]);
  rovo.flash = 1;
  jira.light = 'working';
  const rovoSignal = attachSignal(stage, rovo, jira);

  // Rovo fires up the rest of the Teamwork Graph: a wave from Jira brings every ghost online.
  onStep('graph');
  await fireUp(stage, scene);
  await graph.reveal(stage);
  await wait(stage, 0.4);

  // Rovo secures D3V1N's way into the graph: the gateway over its line to Jira, and the lock.
  onStep('secure');
  // Rovo stays on Jira and sends one of its sub-agents to do it.
  const keeper = spawnDrone(stage, rovo.position.x, rovo.position.z, {
    name: 'Rovo.1',
    lineage: rovo.lineage,
    subAgent: true,
    status: 'working',
  });
  rovo.flash = 1;
  await Promise.all([
    fly(stage, DroneFlight.to(keeper.drone, gateway.center, { speed: 4 })),
    tween(stage, 0.8, (t) => keeper.drone.scale.setScalar(SUB_AGENT_SCALE * (BUD_SCALE + (1 - BUD_SCALE) * t))),
  ]);
  keeper.drone.rig.hover.getWorldPosition(gateway.dropFrom);
  await tween(stage, 0.9, (t) => (gateway.built = t * t * (3 - 2 * t)));
  await tween(stage, 0.7, (t) => (gateway.lockDrop = t));
  gateway.grant();
  keeper.drone.flash = 1;
  // Job done, it heads back to Rovo, docks, and dissolves into it.
  await fly(stage, DroneFlight.to(keeper.drone, jira.position, { speed: 4 }));
  await tween(stage, 0.45, (t) => {
    keeper.drone.scale.setScalar(SUB_AGENT_SCALE * (1 - t * 0.7));
    keeper.drone.fade = 1 - t;
  });
  keeper.despawn();
  rovo.flash = 1;

  // D3V1N's line is connected through it: data starts to flow inside.
  await tween(stage, 0.8, (t) => (gateway.conduit.streams = t));

  // Power comes through the gateway to D3V1N, and it charges up.
  onStep('juiced');
  const toD3v1n = new CurvePath<Vector3>();
  toD3v1n.add(reversed(reach.jira!.route));
  toD3v1n.add(reach.github!.route);
  const boost = { at: (p: Vector3) => inRun(REWORK.gateway, p), speed: 2.2, glow: GRAPH_COLOR };
  await Promise.all(
    Array.from({ length: POWER_PACKETS }, async (_, i) => {
      await wait(stage, i * 0.35);
      await shoot(stage, toD3v1n, 7, boost);
      charge.level = Math.max(charge.level, (i + 1) / POWER_PACKETS);
      drone.flash = 1;
    }),
  );
  charge.burst();
  gateway.grant();
  await tween(stage, 0.5, (t) => drone.scale.setScalar(1 + Math.sin(t * Math.PI) * 0.2 + t * 0.12));
  return () => rovoSignal.detach();
}

/**
 * The wave: a blue ring spreads over the floor from Jira; each tool that
 * wasn't in D3V1N's reach comes online as the ring passes it (its ghost
 * fills in with a little pop).
 */
async function fireUp(stage: SceneHost, { nodes }: ReworkScene): Promise<void> {
  const center = nodes.jira.position;
  const material = new MeshBasicMaterial({ color: GRAPH_COLOR, transparent: true, opacity: 0.5, side: DoubleSide, depthWrite: false });
  const ring = new Mesh(new RingGeometry(0.92, 1, 64), material);
  ring.rotation.x = -Math.PI / 2;
  ring.position.copy(center).setY(0.02);
  stage.add(ring);
  const ghosts = Object.values(nodes).filter((n) => !D3V1N_REACH.includes(n.kind));
  const lit = new Set<string>();
  await tween(stage, WAVE_SECONDS, (t) => {
    const radius = Math.max(0.01, WAVE_REACH * t);
    ring.scale.setScalar(radius);
    material.opacity = 0.5 * (1 - t);
    for (const node of ghosts) {
      if (lit.has(node.kind) || node.position.distanceTo(center) > radius) continue;
      lit.add(node.kind);
      void tween(stage, 0.45, (u) => {
        node.dim = 1 - u;
        node.scale.setScalar(1 + Math.sin(u * Math.PI) * 0.18);
      });
    }
  });
  ring.removeFromParent();
  ring.geometry.dispose();
  material.dispose();
}

/** Carry an object along a floor path at a height, at a speed; `each(t)` runs every frame with progress 0–1. */
function ride(
  stage: SceneHost,
  object: { position: Vector3 },
  path: CurvePath<Vector3>,
  speed: number,
  each: (t: number) => void = () => {},
): Promise<void> {
  const seconds = path.getLength() / speed;
  return tween(stage, seconds, (t) => {
    path.getPointAt(t, object.position);
    object.position.y = CALL_HEIGHT;
    each(t);
  });
}
