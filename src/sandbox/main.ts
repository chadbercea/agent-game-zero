import GUI from 'three/examples/jsm/libs/lil-gui.module.min.js';
import { LINEAGES, type Lineage, STATUSES, type Status } from '../core/palette';
import { Population } from '../stage/Population';
import type { SpawnedAgent } from '../stage/spawnAgent';
import { Stage } from '../stage/Stage';

/**
 * Sandbox: the live isometric world for poking at primitives. Not the game;
 * a bench for spawning agents, flipping states, and judging the feel at scale.
 */

const stage = new Stage(document.getElementById('stage')!, { viewSize: 16 });
const population = new Population(stage);
const MIN_SPACING = 4.2;

const NAMES = ['D3V1N', 'ADA', 'LINUS', 'GRACE', 'KEN', 'BARBARA', 'DENNIS', 'MARGARET', 'ALAN', 'RADIA', 'GUIDO', 'FRAN'];
let nameIndex = 0;

const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

function freeSpot(near?: { x: number; z: number }, radius = 4.2): { x: number; z: number } {
  const agents = population.agents;
  for (let attempt = 0; attempt < 200; attempt++) {
    const spread = near ? radius : 2 + Math.sqrt(agents.length + 1) * 2.8;
    const angle = Math.random() * Math.PI * 2;
    const r = near ? radius * (0.8 + Math.random() * 0.5) : Math.sqrt(Math.random()) * spread;
    const x = (near?.x ?? 0) + Math.cos(angle) * r;
    const z = (near?.z ?? 0) + Math.sin(angle) * r;
    if (agents.every(({ unit }) => Math.hypot(unit.position.x - x, unit.position.z - z) > MIN_SPACING)) {
      return { x, z };
    }
  }
  return { x: (Math.random() - 0.5) * 30, z: (Math.random() - 0.5) * 30 };
}

const settings = {
  labels: false,
  chaos: true,
  chaosInterval: 2.5,
  lineage: 'auto' as Lineage | 'auto',
};

function spawn(options: { parent?: SpawnedAgent; status?: Status } = {}): SpawnedAgent {
  const { parent } = options;
  const spot = freeSpot(parent ? { x: parent.unit.position.x, z: parent.unit.position.z } : undefined);
  const name = parent
    ? `${parent.drone.name}.${population.childrenOf(parent).length + 1}`
    : NAMES[nameIndex++ % NAMES.length];
  const agent = population.spawn(spot.x, spot.z, {
    name,
    parent,
    lineage: settings.lineage === 'auto' ? undefined : settings.lineage,
    status: options.status ?? pick(STATUSES),
    showLabel: true,
  });
  agent.drone.labelVisible = settings.labels;
  return agent;
}

// Selection. Selecting an agent enters Detail for its lineage.
let selected: SpawnedAgent | undefined;
const selection = { name: '—', status: 'waiting' as Status, lineage: 'blue' as Lineage };

function select(target: SpawnedAgent | undefined): void {
  if (selected && !settings.labels) selected.drone.labelVisible = false;
  selected = target;
  population.focus(target);
  if (target) {
    target.drone.labelVisible = true;
    Object.assign(selection, { name: target.drone.name, status: target.drone.status, lineage: target.drone.lineage });
  } else {
    selection.name = '—';
  }
  selectedFolder.controllers.forEach((c) => c.updateDisplay());
  selectedFolder.domElement.style.opacity = target ? '1' : '0.45';
}

let downAt = { x: 0, y: 0 };
stage.renderer.domElement.addEventListener('pointerdown', (e) => (downAt = { x: e.clientX, y: e.clientY }));
stage.renderer.domElement.addEventListener('pointerup', (e) => {
  if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 4) return; // was a pan
  const hit = stage.pick(e.clientX, e.clientY, population.agents.map((a) => a.unit));
  let node = hit?.object;
  let agent: SpawnedAgent | undefined;
  while (node && !(agent = population.agents.find((a) => a.unit === node))) node = node.parent ?? undefined;
  select(agent);
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') select(undefined);
});

// Random status changes keep the crowd moving. Packets follow from them
// (handoff on → Working, escalation on → Stopped); see Population.
let chaosClock = 0;
stage.onTick((dt) => {
  const agents = population.agents;
  if (!settings.chaos || agents.length === 0) return;
  chaosClock += dt;
  if (chaosClock < settings.chaosInterval / Math.max(1, agents.length / 4)) return;
  chaosClock = 0;
  const target = pick(agents);
  target.drone.status = pick(STATUSES.filter((s) => s !== target.drone.status));
  if (target === selected) {
    selection.status = target.drone.status;
    selectedFolder.controllers.forEach((c) => c.updateDisplay());
  }
});

// Panel.
const gui = new GUI({ title: 'Sandbox' });
gui.add({ spawn: () => select(spawn()) }, 'spawn').name('Spawn agent');
gui.add({ sub: () => selected && select(spawn({ parent: selected })) }, 'sub').name('Spawn sub-agent of selected');
gui.add({ ten: () => {
  for (let i = 0; i < 10; i++) {
    const roots = population.agents.filter((a) => !population.parentOf(a));
    spawn(roots.length > 0 && Math.random() < 0.4 ? { parent: pick(roots) } : {});
  }
} }, 'ten').name('Spawn 10');
gui.add(settings, 'lineage', ['auto', ...LINEAGES]).name('New lineage color');

const all = gui.addFolder('All agents');
for (const status of STATUSES) {
  all.add({ go: () => population.agents.forEach((a) => (a.drone.status = status)) }, 'go').name(`All → ${status}`);
}
all.add(settings, 'chaos').name('Random status changes');
all.add(settings, 'chaosInterval', 0.5, 8, 0.5).name('Change interval (s)');
all.add(settings, 'labels').name('Show all labels').onChange((v: boolean) => {
  population.agents.forEach((a) => (a.drone.labelVisible = v || a === selected));
});
all.add({ clear: () => { select(undefined); population.clear(); } }, 'clear').name('Clear');

const selectedFolder = gui.addFolder('Selected (Esc to exit Detail)');
selectedFolder.add(selection, 'name').disable();
selectedFolder.add(selection, 'status', [...STATUSES]).onChange((v: Status) => selected && (selected.drone.status = v));
selectedFolder.add(selection, 'lineage', [...LINEAGES]).name('lineage (whole family)').onChange((v: Lineage) => {
  if (!selected) return;
  for (const member of population.family(selected)) member.drone.lineage = v;
});
selectedFolder.add({ remove: () => {
  if (!selected) return;
  const target = selected;
  select(undefined);
  population.despawn(target);
} }, 'remove').name('Despawn');

// Opening scene: four families, D3V1N's in the middle. Every agent belongs to a
// family, because standalone agents are silent by design (packets stay in-lineage).
const devin = spawn({ status: 'working' });
devin.unit.position.set(0, 0, 0);
for (let i = 0; i < 3; i++) spawn({ parent: devin });
for (const size of [2, 2, 1]) {
  const root = spawn();
  for (let i = 0; i < size; i++) spawn({ parent: root });
}
select(undefined);

Object.assign(window, { sandbox: { stage, population, spawn, select } });
