import GUI from 'three/examples/jsm/libs/lil-gui.module.min.js';
import { Inspector } from '../stage/Inspector';
import { Stage } from '../stage/Stage';
import { OneTicketFull } from '../story/oneTicketFull';
import { oneTicketInspectables } from '../story/oneTicketInspect';
import { wait } from '../story/timeline';

/**
 * Sandbox: one ticket, two ways. "Add dark mode" done the enclosed way
 * (Version A: D3V1N crosses four separate gates, carrying all the context
 * itself), then the same work with the Atlassian Teamwork Graph (Version B:
 * one gateway, Rovo hands back the connected context, and the record keeps
 * itself). The scene clears between them. No captions; the camera holds still.
 */

const stage = new Stage(document.getElementById('stage')!, { viewSize: 15 });
const story = new OneTicketFull(stage, (center) => stage.centerOn(center.clone().setY(0.6)));

// Hover anything to highlight it; click it for its details on the right.
const inspector = new Inspector(stage, oneTicketInspectables(story));

const settings = { autoRun: true, pauseBetweenRuns: 1.5 };
let running = false;

async function run(): Promise<void> {
  if (running) return;
  running = true;
  await story.play();
  running = false;
}

// Auto-run: A, then B, then again.
void (async () => {
  await wait(stage, 0.8);
  for (;;) {
    if (settings.autoRun && !running) {
      await run();
      await wait(stage, settings.pauseBetweenRuns);
    } else {
      await wait(stage, 0.5);
    }
  }
})();

// Panel.
const gui = new GUI({ title: 'Sandbox' });
gui.add({ run: () => void run() }, 'run').name('Play A then B');
gui.add(settings, 'autoRun').name('Auto-run');
gui.add(settings, 'pauseBetweenRuns', 0.5, 8, 0.5).name('Pause between runs (s)');

Object.assign(window, { sandbox: { stage, story, inspector, run, settings }, __stage: stage });
