import type { Meta, StoryObj } from '@storybook/html-vite';
import { type Drone, SUB_AGENT_SCALE } from '../primitives/drone/Drone';
import { Gateway } from '../primitives/gateway/Gateway';
import { spawnDrone } from '../stage/spawnDrone';
import { specimenStage } from '../stage/specimen';
import type { SceneHost } from '../stage/Stage';
import { DroneFlight } from '../animation/DroneFlight';
import { Ticket } from '../primitives/ticket/Ticket';
import { attachSignal } from '../stage/attachSignal';
import { accessCheck } from './accessCheck';
import { act2, crossGateway, gatewayCrossing, goHome, graphTraffic, securityGateway } from './act2';
import { type CrewMember, dismiss, fanOut, keepWorking } from './fanOut';
import { hoverCards } from './hoverCards';
import { ACT1_GATE, ATLASSIAN_GATE, GATEWAY, ROVO_HOME, ROVO_REQUEST, SECURITY_HOME, STORY_CENTER } from './layout';
import { leaveBase } from './leaveBase';
import { takeRequest } from './request';
import type { TeamworkGraph } from './TeamworkGraph';
import { STORY_CAPTION, TeamworkStory } from './teamworkStory';
import { fly, tween, wait } from './timeline';
import { SMALL_TICKET } from './trickle';
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
 * The whole story on loop, as the sandbox plays it: DEMO-1 lands for D3V1N →
 * Act 1 (3 agents, 3 isolated jobs) → Rovo takes the same request → access,
 * map, four more sub-agents → the security bot builds the gateway → the
 * Teamwork Graph draws in → work changes hands across the graph while small
 * tickets trickle in → DEMO-1 ships, one change among many → everyone comes
 * home → replay. Hover anything for its volume of work.
 */
export const Full: StoryObj = {
  render: () => {
    const { root, stage } = specimenStage(VIEW);
    stage.centerOn(STORY_CENTER);
    const say = captioned(root);
    const story = new TeamworkStory(stage, twoActScene(stage), (step) => say(STORY_CAPTION[step]));
    hoverCards(stage, () => story.hoverTargets());
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

/**
 * The secure gateway, already built (lock on), for the staged stories. Fed by
 * the graph like the shipped story's: its streams flow only while the graph's
 * lines are connected to its ends (see TeamworkGraph.feed).
 */
function builtGateway(stage: SceneHost, graph: TeamworkGraph): Gateway {
  const gateway = new Gateway(GATEWAY);
  gateway.dropFrom.copy(gateway.center).setY(0.6);
  gateway.built = gateway.lockDrop = 1;
  stage.add(gateway);
  stage.onTick((dt) => gateway.update(dt));
  graph.feed(gateway.conduit);
  return gateway;
}

/** Once the lines are connected, the streams start inside the tunnel. */
async function startStreams(stage: SceneHost, gateway: Gateway): Promise<void> {
  await tween(stage, 1, (t) => (gateway.conduit.streams = t));
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
    const gateway = builtGateway(stage, graph);
    const rovo = stagedRovo(stage);
    void (async () => {
      const { crew } = await connectedScene(stage, scene, graph, rovo);
      await startStreams(stage, gateway);
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

/**
 * The transition into Act 2. Act 1 is already working at the first gate. Rovo
 * takes the same request (DEMO-1 lands in front of it), flies to the
 * Atlassian gate, gets access, maps the system and fans out four sub-agents.
 * Loops: Rovo's crew is dismissed, Rovo leaves, and it starts again.
 */
export const Transition: StoryObj = {
  render: () => {
    const { root, stage } = specimenStage(VIEW);
    stage.centerOn(STORY_CENTER);
    const say = captioned(root);
    const scene = twoActScene(stage);
    const { drone, act1, act2: system } = scene;
    act1.gate.state = 'open';
    drone.position.copy(ACT1_GATE);
    drone.status = 'working';
    act1.map.showAll();
    act1.map.linesVisible = false;
    const ticket = new Ticket(undefined, { label: false });
    ticket.scale.setScalar(SMALL_TICKET);
    ticket.visible = false;
    stage.add(ticket);
    stage.onTick((dt) => ticket.update(dt));
    void (async () => {
      const crew1 = await fanOut(stage, drone, act1.map);
      crew1.forEach((member) => keepWorking(stage, member));
      say(STORY_CAPTION.working);
      for (;;) {
        await wait(stage, 1.5);
        say(STORY_CAPTION.rovo);
        const rovo = spawnDrone(stage, ROVO_HOME.x, ROVO_HOME.z, {
          name: 'Rovo',
          lineage: 'cyan',
          showLabel: true,
          status: 'waiting',
        });
        const signal = attachSignal(stage, rovo.drone, system.gate);
        await takeRequest(stage, ticket, ROVO_REQUEST, rovo.drone);
        rovo.drone.status = 'working';
        await fly(stage, DroneFlight.to(rovo.drone, system.gate.position));
        say(STORY_CAPTION['access-2']);
        await accessCheck(stage, rovo.drone, system.gate);
        const crew2 = await act2(stage, rovo.drone, system.map, (step) =>
          say(STORY_CAPTION[step === 'mapping' ? 'mapping-2' : 'fan-out-2']),
        );
        say('Both systems working, still apart');
        await wait(stage, 4);
        crew2.stop();
        dismiss(crew2.crew);
        system.map.hide();
        system.gate.state = 'off';
        await leaveBase(stage, { drone: rovo.drone, gate: system.gate, signal }, ROVO_HOME);
        await tween(stage, 0.6, (t) => (rovo.drone.fade = 1 - t));
        signal.detach();
        rovo.despawn();
      }
    })();
    return root;
  },
};

/**
 * The end of the story: the connected system at work, then DEMO-1 ships, one
 * change among many. Both agents acknowledge, everyone heads home carrying
 * their work, and the graph fades; the tunnel's streams stop with its lines.
 * Then the gateway folds away. Loops.
 */
export const ShipAndHome: StoryObj = {
  render: () => {
    const { root, stage } = specimenStage(VIEW);
    stage.centerOn(STORY_CENTER);
    const say = captioned(root);
    const scene = twoActScene(stage);
    const graph = teamworkGraph(stage, scene);
    const gateway = builtGateway(stage, graph);
    const rovo = stagedRovo(stage);
    void (async () => {
      for (;;) {
        gateway.built = gateway.lockDrop = 1;
        const working = await connectedScene(stage, scene, graph, rovo);
        await startStreams(stage, gateway);
        say(STORY_CAPTION.connected);
        const stopTraffic = graphTraffic(stage, graph, working.crew);
        await wait(stage, 4);
        stopTraffic();
        working.stop();
        await wait(stage, 0.6);
        scene.drone.flash = rovo.flash = 1;
        say(STORY_CAPTION.shipped);
        await wait(stage, 2.5);
        say(STORY_CAPTION.home);
        await Promise.all([
          ...working.crew.map((m, i) => wait(stage, i * 0.25).then(() => goHome(stage, m, working.parentOf(m)))),
          wait(stage, 1).then(() => graph.fade(stage, 1.6)),
        ]);
        await tween(stage, 0.8, (t) => {
          gateway.built = 1 - t;
          gateway.lockDrop = 1 - t;
        });
        say(STORY_CAPTION.done);
        scene.act1.map.hide();
        scene.act2.map.hide();
        await wait(stage, 1.5);
      }
    })();
    return root;
  },
};
