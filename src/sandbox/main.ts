import { attachSignal } from '../stage/attachSignal';
import { Vector3 } from 'three';
import GUI from 'three/examples/jsm/libs/lil-gui.module.min.js';
import { DroneFlight } from '../animation/DroneFlight';
import { GateAnimator } from '../animation/GateAnimator';
import { Gate } from '../primitives/gate/Gate';
import { SYSTEM_KINDS } from '../primitives/node/emblems';
import { Stage } from '../stage/Stage';
import { FACE_CAMERA, spawnDrone } from '../stage/spawnDrone';
import { hoverLines } from '../story/hoverLines';
import { JOB_STEP_CAPTION, type JobStep, runJob } from '../story/runJob';
import { SystemMap } from '../story/SystemMap';
import { fly, wait } from '../story/timeline';

/**
 * Sandbox: one agent and one gate. The agent story plays from there: access
 * check → system map → sub-agents fan out, work and return. Hover the gate or
 * a node to see the system's lines; click to pin them.
 */

const stage = new Stage(document.getElementById('stage')!, { viewSize: 13 });
stage.centerOn(new Vector3(0, 0, 0));

const gate = new Gate();
gate.position.set(2, 0, 2);
gate.rotation.y = FACE_CAMERA;
const gateAnimator = new GateAnimator(gate);
stage.add(gate);
stage.onTick((dt) => gateAnimator.update(dt));

const map = new SystemMap(stage, gate, SYSTEM_KINDS);
hoverLines(stage, map);

const HOME = new Vector3(-1.8, 0, 5);
const { drone } = spawnDrone(stage, HOME.x, HOME.z, { name: 'D3V1N', showLabel: true, status: 'waiting' });
attachSignal(stage, drone, gate);

// Caption: what the story is doing right now.
const caption = document.getElementById('caption')!;
const say = (text: string) => (caption.textContent = text);

const settings = { autoRun: true, gateWorks: true, pauseBetweenRuns: 4 };
let running = false;
let deniedAtGate = false;

/** Put the scene back to its opening state: map hidden, gate off, drone home. */
async function reset(): Promise<void> {
  map.hide();
  gate.state = 'off';
  deniedAtGate = false;
  if (Math.hypot(drone.position.x - HOME.x, drone.position.z - HOME.z) > 1e-3) {
    say('Heading home…');
    drone.status = 'working';
    await fly(stage, DroneFlight.to(drone, HOME));
  }
  drone.status = 'waiting';
  say('Ready.');
}

async function run(): Promise<void> {
  if (running) return;
  running = true;
  if (map.revealed || deniedAtGate) await reset();
  gate.works = settings.gateWorks;
  const granted = await runJob(stage, { drone, gate, map }, (step: JobStep) => say(JOB_STEP_CAPTION[step]));
  deniedAtGate = !granted;
  running = false;
  if (!granted) say(`${JOB_STEP_CAPTION.denied} Turn “Gate works” back on and retry.`);
}

/** After a red, try the gate again from where the drone is; on green the job carries on. */
async function retry(): Promise<void> {
  if (running || !deniedAtGate) return;
  deniedAtGate = false;
  gate.state = 'off';
  await run();
}

// Auto-run: replay the story on a loop, with a pause between runs.
void (async () => {
  await wait(stage, 1);
  for (;;) {
    if (settings.autoRun && !running && !deniedAtGate) {
      await run();
      await wait(stage, settings.pauseBetweenRuns);
    } else {
      await wait(stage, 0.5);
    }
  }
})();

// Panel.
const gui = new GUI({ title: 'Sandbox' });
gui.add({ run: () => void run() }, 'run').name('Run job');
gui.add({ retry: () => void retry() }, 'retry').name('Retry access');
gui.add(settings, 'gateWorks').name('Gate works');
gui.add(settings, 'autoRun').name('Auto-run');
gui.add(settings, 'pauseBetweenRuns', 1, 12, 0.5).name('Pause between runs (s)');
gui.add({ reset: () => void (!running && reset()) }, 'reset').name('Reset');

say('Ready.');
Object.assign(window, { sandbox: { stage, drone, gate, map, run, retry, reset, settings } });
