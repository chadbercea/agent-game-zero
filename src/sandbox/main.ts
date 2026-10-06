import GUI from 'three/examples/jsm/libs/lil-gui.module.min.js';
import { Stage } from '../stage/Stage';
import { hoverLines } from '../story/hoverLines';
import { STORY_CENTER } from '../story/layout';
import { STORY_CAPTION, TeamworkStory } from '../story/teamworkStory';
import { wait } from '../story/timeline';
import { twoActScene } from '../story/twoActs';

/**
 * Sandbox: the whole two-act story on one grid. Act 1: three sub-agents,
 * three isolated jobs. Act 2: D3V1N takes the work to Atlassian, the Teamwork
 * Graph links every system, seven agents work as one connected system, and
 * everything converges into one shipped result. Hover a gate or a node to see
 * its system's lines; click to pin them.
 */

const stage = new Stage(document.getElementById('stage')!, { viewSize: 17 });
stage.centerOn(STORY_CENTER);

const scene = twoActScene(stage);
hoverLines(stage, scene.act1.map);
hoverLines(stage, scene.act2.map);

// Caption: what the story is doing right now.
const caption = document.getElementById('caption')!;
const say = (text: string) => (caption.textContent = text);
const story = new TeamworkStory(stage, scene, (step) => say(STORY_CAPTION[step]));

const settings = { autoRun: true, gateWorks: true, pauseBetweenRuns: 3 };
let running = false;
/** Stopped at a gate that said no; Retry tries that gate again. */
let denied = false;
let finished = false;

async function reset(): Promise<void> {
  say('Heading home…');
  await story.reset();
  denied = finished = false;
  say('Ready.');
}

async function run(): Promise<void> {
  if (running) return;
  running = true;
  if (finished || denied) await reset();
  scene.act1.gate.works = scene.act2.gate.works = settings.gateWorks;
  const done = await story.play();
  denied = !done;
  finished = done;
  running = false;
  if (denied) say(`${STORY_CAPTION.denied} Turn “Gate works” back on and retry.`);
}

/** After a red, try that gate again from where D3V1N is; on green the story carries on. */
async function retry(): Promise<void> {
  if (running || !denied) return;
  running = true;
  scene.act1.gate.works = scene.act2.gate.works = settings.gateWorks;
  const done = await story.play();
  denied = !done;
  finished = done;
  running = false;
  if (denied) say(`${STORY_CAPTION.denied} Turn “Gate works” back on and retry.`);
}

// Auto-run: replay the story on a loop, with a pause between runs.
void (async () => {
  await wait(stage, 1);
  for (;;) {
    if (settings.autoRun && !running && !denied) {
      await run();
      await wait(stage, settings.pauseBetweenRuns);
    } else {
      await wait(stage, 0.5);
    }
  }
})();

// Panel.
const gui = new GUI({ title: 'Sandbox' });
gui.add({ run: () => void run() }, 'run').name('Run story');
gui.add({ retry: () => void retry() }, 'retry').name('Retry access');
gui.add(settings, 'gateWorks').name('Gate works');
gui.add(settings, 'autoRun').name('Auto-run');
gui.add(settings, 'pauseBetweenRuns', 1, 12, 0.5).name('Pause between runs (s)');
gui.add({ reset: () => void (!running && reset()) }, 'reset').name('Reset');

say('Ready.');
Object.assign(window, { sandbox: { stage, scene, story, run, retry, reset, settings }, __stage: stage });
