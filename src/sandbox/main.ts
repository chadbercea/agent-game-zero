import GUI from 'three/examples/jsm/libs/lil-gui.module.min.js';
import { Stage } from '../stage/Stage';
import { hoverCards } from '../story/hoverCards';
import { hoverLines } from '../story/hoverLines';
import { STORY_CENTER } from '../story/layout';
import { StoryV2 } from '../story/storyV2';
import { wait } from '../story/timeline';

/**
 * Sandbox: the reworked story, start to finish, on the two-system grid. A
 * cloud drops DEMO-1, D3V1N maps its own system and starts a branch; Rovo
 * arrives, maps its Teamwork Graph and builds the secure bridge; juiced,
 * D3V1N's crew works across both systems and output ships through the
 * portal. No captions. Hover a gate, a tool or an agent for its numbers;
 * hover a gate or a tool to see its system's lines, click to pin them.
 */

const stage = new Stage(document.getElementById('stage')!, { viewSize: 15 });
stage.centerOn(STORY_CENTER);

const story = new StoryV2(stage);
const { scene } = story;
hoverLines(stage, scene.act1.map);
hoverLines(stage, scene.act2.map);

// Volume of work: hover anything for its own numbers; the grand total sits quietly in the corner.
hoverCards(stage, () => story.hoverTargets());
const totals = document.getElementById('totals')!;
const fmt = (n: number) => n.toLocaleString('en-US');
let sinceTotals = Infinity;
stage.onTick((dt) => {
  sinceTotals += dt;
  if (sinceTotals < 0.5) return;
  sinceTotals = 0;
  const t = story.volume.ledger.totals('node');
  totals.textContent = `Today on the grid · ${fmt(t.done)} done · ${fmt(t.inProgress)} in progress · ${fmt(t.queued)} queued`;
});

const settings = { autoRun: true, gateWorks: true, hold: 20, pauseBetweenRuns: 2 };
let running = false;
let played = false;

async function reset(): Promise<void> {
  await story.reset();
  played = false;
}

async function run(): Promise<void> {
  if (running) return;
  running = true;
  if (played) await reset();
  scene.act1.gate.works = scene.act2.gate.works = settings.gateWorks;
  played = true;
  await story.play();
  running = false;
}

// Auto-run: play the whole story, let the full system run a while, clear, and go again.
void (async () => {
  await wait(stage, 1);
  for (;;) {
    if (settings.autoRun && !running) {
      await run();
      await wait(stage, settings.hold);
      if (settings.autoRun) await reset();
      await wait(stage, settings.pauseBetweenRuns);
    } else {
      await wait(stage, 0.5);
    }
  }
})();

// Panel.
const gui = new GUI({ title: 'Sandbox' });
gui.add({ run: () => void run() }, 'run').name('Run story');
gui.add(settings, 'gateWorks').name('Gate works');
gui.add(settings, 'autoRun').name('Auto-run');
gui.add(settings, 'hold', 5, 60, 1).name('Full system runs for (s)');
gui.add(settings, 'pauseBetweenRuns', 1, 12, 0.5).name('Pause between runs (s)');
gui.add({ reset: () => void (!running && reset()) }, 'reset').name('Reset');

Object.assign(window, { sandbox: { stage, scene, story, run, reset, settings }, __stage: stage });
