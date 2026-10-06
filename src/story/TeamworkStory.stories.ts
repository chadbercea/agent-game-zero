import type { Meta, StoryObj } from '@storybook/html-vite';
import { Deliverable } from '../primitives/deliverable/Deliverable';
import { specimenStage } from '../stage/specimen';
import type { SceneHost } from '../stage/Stage';
import { comeHome, converge, graphTraffic } from './act2';
import { fanOut, keepWorking } from './fanOut';
import { ATLASSIAN_GATE, STORY_CENTER } from './layout';
import type { TeamworkGraph } from './TeamworkGraph';
import { STORY_CAPTION, TeamworkStory } from './teamworkStory';
import { wait } from './timeline';
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

/** Both systems open, D3V1N at the Atlassian gate, all seven sub-agents out and working, the graph drawn. */
async function connectedScene(stage: SceneHost, scene: TwoActScene, graph: TeamworkGraph) {
  const { drone, act1, act2 } = scene;
  act1.gate.state = act2.gate.state = 'open';
  drone.position.copy(ATLASSIAN_GATE);
  drone.status = 'working';
  act1.signal.mute(true);
  for (const map of [act1.map, act2.map]) {
    map.showAll();
    map.linesVisible = false;
  }
  graph.showAll();
  const crew = (await Promise.all([fanOut(stage, drone, act1.map), fanOut(stage, drone, act2.map)])).flat();
  const stops = crew.map((member) => keepWorking(stage, member));
  return { crew, stop: () => stops.forEach((stop) => stop()) };
}

/** Act 2's handoffs on their own: work products changing hands node to node along the graph, nonstop. */
export const Handoffs: StoryObj = {
  render: () => {
    const { root, stage } = specimenStage(VIEW);
    stage.centerOn(STORY_CENTER);
    const scene = twoActScene(stage);
    const graph = teamworkGraph(stage, scene);
    void (async () => {
      const { crew } = await connectedScene(stage, scene, graph);
      graphTraffic(stage, graph, crew);
    })();
    return root;
  },
};

/** The payoff on its own: every product converges across the graph into one shipped deliverable, then everyone comes home. Loops. */
export const Converge: StoryObj = {
  render: () => {
    const { root, stage } = specimenStage(VIEW);
    stage.centerOn(STORY_CENTER);
    const scene = twoActScene(stage);
    const graph = teamworkGraph(stage, scene);
    const deliverable = new Deliverable();
    deliverable.position.copy(ATLASSIAN_GATE).add({ x: 1.13, y: 1.6, z: -1.13 });
    deliverable.visible = false;
    stage.add(deliverable);
    stage.onTick((dt) => deliverable.update(dt));
    void (async () => {
      for (;;) {
        const working = await connectedScene(stage, scene, graph);
        await wait(stage, 2);
        working.stop();
        await converge(stage, scene, graph, working.crew, deliverable);
        await wait(stage, 2);
        const act1Crew = working.crew.filter((m) => scene.act1.map.nodes.includes(m.node));
        const act2Crew = working.crew.filter((m) => scene.act2.map.nodes.includes(m.node));
        await Promise.all([comeHome(stage, scene, act1Crew, act2Crew), graph.fade(stage, 1.6)]);
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
