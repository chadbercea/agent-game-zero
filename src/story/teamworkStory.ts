import { Vector3 } from 'three';
import { Deliverable } from '../primitives/deliverable/Deliverable';
import { FACE_CAMERA } from '../stage/spawnDrone';
import type { SceneHost } from '../stage/Stage';
import { accessCheck } from './accessCheck';
import { act2, comeHome, converge, graphTraffic } from './act2';
import { dismiss } from './fanOut';
import { HOME } from './layout';
import { leaveBase } from './leaveBase';
import { TeamworkGraph } from './TeamworkGraph';
import { tween, wait } from './timeline';
import { act1, type TwoActScene, type WorkingCrew } from './twoActs';

export type StoryStep =
  | 'access'
  | 'denied'
  | 'mapping'
  | 'fan-out'
  | 'working'
  | 'transition'
  | 'access-2'
  | 'mapping-2'
  | 'graph'
  | 'fan-out-2'
  | 'connected'
  | 'converge'
  | 'shipped'
  | 'home'
  | 'done';

export const STORY_CAPTION: Record<StoryStep, string> = {
  access: 'Checking access…',
  denied: 'Access denied. The system isn’t working as expected.',
  mapping: 'Access granted. Mapping the system…',
  'fan-out': 'Spawning sub-agents…',
  working: 'Act 1 · 3 agents, 3 isolated jobs',
  transition: 'Taking the work to Atlassian…',
  'access-2': 'Checking access to Atlassian…',
  'mapping-2': 'Access granted. Mapping Atlassian…',
  graph: 'The Teamwork Graph already knows every system on the grid',
  'fan-out-2': 'Spawning sub-agents for Atlassian…',
  connected: 'Act 2 · Teamwork Graph: 7 agents, one connected system',
  converge: 'Converging on one result…',
  shipped: 'Shipped.',
  home: 'Sub-agents heading home…',
  done: 'Done.',
};

/** How long Act 1 runs on its own before D3V1N takes the work to Atlassian. */
export const ACT1_HOLD = 4;
/** How long the connected system runs (handoffs across the graph) before converging. */
export const CONNECTED_SECONDS = 12;
/** How long the shipped deliverable holds before everyone heads home. */
const SHIPPED_HOLD = 2.5;
/** The deliverable floats beside D3V1N: to its right on screen, about body height. */
const DELIVERABLE_OFFSET = new Vector3(Math.cos(FACE_CAMERA), 0, -Math.sin(FACE_CAMERA)).multiplyScalar(1.6).setY(1.6);

/**
 * The whole two-act story, start to finish, on one grid:
 * Act 1: access → map → three sub-agents, three isolated jobs.
 * Transition: D3V1N leaves them working and takes the work to Atlassian.
 * Act 2: access → map → the Teamwork Graph draws in across every node →
 * four more sub-agents → work changes hands node to node along the graph.
 * Converge: every product flows across the graph into one shipped
 * deliverable at D3V1N; all seven sub-agents come home; the graph fades.
 *
 * `play()` runs from wherever the story stands: from the top, or (after a
 * denial) a retry at the gate that said no. `reset()` puts the scene back.
 */
export class TeamworkStory {
  readonly graph: TeamworkGraph;
  readonly deliverable = new Deliverable();
  private act1Crew: WorkingCrew | null = null;
  private act2Crew: WorkingCrew | null = null;
  /** Which gate D3V1N is at. */
  private at: 'act1' | 'act2' = 'act1';

  constructor(
    private readonly stage: SceneHost,
    readonly scene: TwoActScene,
    private readonly onStep: (step: StoryStep) => void = () => {},
  ) {
    const { act1: a, act2: b } = scene;
    this.graph = new TeamworkGraph(stage, [a.map.nodes, b.map.nodes], scene.graphLines);
    this.deliverable.position.copy(b.gate.position).add(DELIVERABLE_OFFSET);
    this.deliverable.visible = false;
    stage.add(this.deliverable);
    stage.onTick((dt) => this.deliverable.update(dt));
  }

  /** Resolves true when the story completes, false when a gate denies access (D3V1N waits there, Stopped). */
  async play(): Promise<boolean> {
    const { stage, scene, onStep } = this;
    const { drone } = scene;

    if (!this.act1Crew) {
      this.act1Crew = await act1(stage, scene, onStep);
      if (!this.act1Crew) {
        onStep('denied');
        return false;
      }
      await wait(stage, ACT1_HOLD);
    }

    if (this.at === 'act1') {
      onStep('transition');
      await leaveBase(stage, { drone, ...scene.act1 }, scene.act2.gate.position, { keepOpen: true });
      this.at = 'act2';
    }
    onStep('access-2');
    if (!(await accessCheck(stage, drone, scene.act2.gate))) {
      onStep('denied');
      return false;
    }

    this.act2Crew = await act2(stage, scene, this.graph, (step) =>
      onStep(step === 'mapping' ? 'mapping-2' : step === 'fan-out' ? 'fan-out-2' : 'graph'),
    );
    onStep('connected');
    const crew = [...this.act1Crew.crew, ...this.act2Crew.crew];
    const stopTraffic = graphTraffic(stage, this.graph, crew);
    await wait(stage, CONNECTED_SECONDS);
    stopTraffic();

    onStep('converge');
    this.act1Crew.stop();
    this.act2Crew.stop();
    await wait(stage, 0.6);
    await converge(stage, scene, this.graph, crew, this.deliverable);
    onStep('shipped');
    await wait(stage, SHIPPED_HOLD);

    onStep('home');
    await Promise.all([
      comeHome(stage, scene, this.act1Crew.crew, this.act2Crew.crew),
      (async () => {
        await wait(stage, 1);
        await this.graph.fade(stage, 1.6);
      })(),
      this.putAwayDeliverable(),
    ]);
    this.act1Crew = this.act2Crew = null;
    drone.status = 'waiting';
    onStep('done');
    return true;
  }

  /** Back to the opening: crews dismissed, graph and maps hidden, gates off, D3V1N home. */
  async reset(): Promise<void> {
    const { stage, scene } = this;
    for (const crew of [this.act1Crew, this.act2Crew]) {
      if (!crew) continue;
      crew.stop();
      dismiss(crew.crew);
    }
    this.act1Crew = this.act2Crew = null;
    this.graph.hide();
    this.deliverable.reset();
    this.deliverable.visible = false;
    scene.act1.map.hide();
    scene.act2.map.hide();
    const here = this.at === 'act1' ? scene.act1 : scene.act2;
    scene.act1.gate.state = scene.act2.gate.state = 'off';
    if (scene.drone.position.distanceTo(HOME) > 1e-3) await leaveBase(stage, { drone: scene.drone, ...here }, HOME);
    this.at = 'act1';
    scene.drone.status = 'waiting';
  }

  /** The shipped product rises a little and fades into D3V1N's keeping. */
  private async putAwayDeliverable(): Promise<void> {
    const { stage, deliverable } = this;
    const y = deliverable.position.y;
    deliverable.material.transparent = true;
    await tween(stage, 1.2, (t) => {
      deliverable.position.y = y + t * 0.4;
      deliverable.material.opacity = 1 - t;
    });
    deliverable.visible = false;
    deliverable.reset();
    deliverable.position.y = y;
    deliverable.material.opacity = 1;
    deliverable.material.transparent = false;
  }
}
