import type { Meta, StoryObj } from '@storybook/html-vite';
import { Deliverable } from '../primitives/deliverable/Deliverable';
import { type Drone, SUB_AGENT_SCALE } from '../primitives/drone/Drone';
import { Gateway } from '../primitives/gateway/Gateway';
import { spawnDrone } from '../stage/spawnDrone';
import { specimenStage } from '../stage/specimen';
import type { SceneHost } from '../stage/Stage';
import { converge, crossGateway, gatewayCrossing, goHome, graphTraffic, securityGateway } from './act2';
import { type CrewMember, fanOut, keepWorking } from './fanOut';
import { ACT1_GATE, ATLASSIAN_GATE, GATEWAY, SECURITY_HOME, STORY_CENTER } from './layout';
import type { TeamworkGraph } from './TeamworkGraph';
import { STORY_CAPTION, TeamworkStory } from './teamworkStory';
import { tween, wait } from './timeline';
import { type TwoActScene, twoActScene, teamworkGraph } from './twoActs';

const meta: Meta = {
  title: 'Story/10 Teamwork Story',
  parameters: { layout: 'fullscreen' },
};
export default meta;

const VIEW = { viewSize: 17, focusY: 0 };

/** A caption line over the stage, like the sandbox's. */
function captioned(root: HTMLElement): (text: string) => void {
  const caption = document.createElement('div');
  Object.assign(caption.style, {
    position: 'absolute',
    left: '16px',
    bottom: '16px',
    font: '14px/1.4 ui-sans-serif, system-ui, sans-serif',
    color: '#3a3b40',
    pointerEvents: 'none',
  } satisfies Partial<CSSStyleDeclaration>);
  root.style.position = 'relative';
  root.appendChild(caption);
  return (text) => (caption.textContent = text);
}

/**
 * The whole two-act story on loop: Act 1 (3 agents, 3 isolated jobs) → D3V1N
 * takes the work to Atlassian → the Teamwork Graph draws in → 7 agents, work
 * changing hands across the graph → everything converges into one shipped
 * deliverable at D3V1N → everyone comes home → replay.
 */
export const Full: StoryObj = {
  render: () => {
    const { root, stage } = specimenStage(VIEW);
    stage.centerOn(STORY_CENTER);
    const say = captioned(root);
    const story = new TeamworkStory(stage, twoActScene(stage), (step) => say(STORY_CAPTION[step]));
    void (async () => {
      for (;;) {
        await wait(stage, 1);
        if (await story.play()) await wait(stage, 2);
        await story.reset();
      }
    })();
    return root;
  },
};

/**
 * Both systems open, D3V1N at its gate and Rovo at Atlassian's, all seven
 * sub-agents out and working, then the graph draws in. Returns the crew and
 * each sub-agent's parent.
 */
async function connectedScene(stage: SceneHost, scene: TwoActScene, graph: TeamworkGraph, rovo: Drone) {
  const { drone, act1, act2 } = scene;
  act1.gate.state = act2.gate.state = 'open';
  drone.position.copy(ACT1_GATE);
  rovo.position.copy(ATLASSIAN_GATE);
  drone.status = rovo.status = 'working';
  for (const map of [act1.map, act2.map]) {
    map.showAll();
    map.linesVisible = false;
  }
  const [crew1, crew2] = await Promise.all([fanOut(stage, drone, act1.map), fanOut(stage, rovo, act2.map)]);
  const crew = [...crew1, ...crew2];
  const stops = crew.map((member) => keepWorking(stage, member));
  // Everyone's working: now the graph draws in between them.
  await graph.reveal(stage);
  const parentOf = (m: CrewMember) => (crew1.includes(m) ? drone : rovo);
  return { crew, parentOf, stop: () => stops.forEach((stop) => stop()) };
}

/** The secure gateway, already built (lock on, streams flowing), for the staged stories. */
function builtGateway(stage: SceneHost): Gateway {
  const gateway = new Gateway(GATEWAY);
  gateway.dropFrom.copy(gateway.center).setY(0.6);
  gateway.built = gateway.lockDrop = gateway.conduit.streams = 1;
  stage.add(gateway);
  stage.onTick((dt) => gateway.update(dt));
  return gateway;
}

/** Rovo, parked at the Atlassian gate for the staged stories. */
function stagedRovo(stage: SceneHost): Drone {
  return spawnDrone(stage, ATLASSIAN_GATE.x, ATLASSIAN_GATE.z, { name: 'Rovo', lineage: 'cyan', showLabel: true })
    .drone;
}

/** Act 2's handoffs on their own: work products changing hands node to node along the graph, nonstop. */
export const Handoffs: StoryObj = {
  render: () => {
    const { root, stage } = specimenStage(VIEW);
    stage.centerOn(STORY_CENTER);
    const scene = twoActScene(stage);
    const graph = teamworkGraph(stage, scene);
    builtGateway(stage);
    const rovo = stagedRovo(stage);
    void (async () => {
      const { crew } = await connectedScene(stage, scene, graph, rovo);
      graphTraffic(stage, graph, crew);
    })();
    return root;
  },
};

/**
 * The secure gateway on its own: the security bot flies in, the glass tunnel
 * scales up, and it drops the lock. Then a sub-agent crosses back and forth
 * between the systems through it, the tunnel and lock flashing green each
 * time it passes. Loops.
 */
export const SecureGateway: StoryObj = {
  render: () => {
    const { root, stage } = specimenStage(VIEW);
    stage.centerOn(STORY_CENTER);
    const scene = twoActScene(stage);
    const gateway = new Gateway(GATEWAY);
    stage.add(gateway);
    stage.onTick((dt) => gateway.update(dt));
    const traveler = spawnDrone(stage, ACT1_GATE.x, ACT1_GATE.z, {
      name: 'D3V1N.1',
      subAgent: true,
      status: 'working',
    }).drone;
    traveler.scale.setScalar(SUB_AGENT_SCALE);
    const [a, b] = [scene.act1.gate.position.clone(), scene.act2.gate.position.clone()];
    void (async () => {
      for (;;) {
        await securityGateway(stage, gateway, SECURITY_HOME);
        for (let k = 0; k < 2; k++) {
          await crossGateway(stage, traveler, gateway, gatewayCrossing(traveler.position, gateway, b));
          await wait(stage, 1);
          await crossGateway(stage, traveler, gateway, gatewayCrossing(traveler.position, gateway, a));
          await wait(stage, 1);
        }
        await tween(stage, 0.8, (t) => {
          gateway.built = 1 - t;
          gateway.lockDrop = 1 - t;
        });
        await wait(stage, 1);
      }
    })();
    return root;
  },
};

/** The payoff on its own: every product converges across the graph into one shipped deliverable at D3V1N, then everyone comes home. Loops. */
export const Converge: StoryObj = {
  render: () => {
    const { root, stage } = specimenStage(VIEW);
    stage.centerOn(STORY_CENTER);
    const scene = twoActScene(stage);
    const graph = teamworkGraph(stage, scene);
    builtGateway(stage);
    const rovo = stagedRovo(stage);
    const deliverable = new Deliverable();
    deliverable.position.copy(ACT1_GATE).add({ x: 1.13, y: 1.6, z: -1.13 });
    deliverable.visible = false;
    stage.add(deliverable);
    stage.onTick((dt) => deliverable.update(dt));
    void (async () => {
      for (;;) {
        const working = await connectedScene(stage, scene, graph, rovo);
        await wait(stage, 2);
        working.stop();
        await converge(stage, scene, graph, working.crew, deliverable);
        await wait(stage, 2);
        await Promise.all([
          ...working.crew.map((m, i) =>
            wait(stage, i * 0.25).then(() => goHome(stage, m, working.parentOf(m), { carry: false })),
          ),
          graph.fade(stage, 1.6),
        ]);
        deliverable.reset();
        deliverable.visible = false;
        scene.act1.map.hide();
        scene.act2.map.hide();
        await wait(stage, 1.5);
      }
    })();
    return root;
  },
};
