import GUI from 'three/examples/jsm/libs/lil-gui.module.min.js';
import { Inspector } from '../stage/Inspector';
import { Stage } from '../stage/Stage';
import { FamilyTree } from '../story/familyTree';
import { RovoAtlassian } from '../story/rovoAtlassian';
import { rovoInspectables } from '../story/rovoInspect';

/**
 * Sandbox: Rovo on the Atlassian Grid, the same scene as Storybook's
 * Story Narrative (docs/rovo-mental-model.md). Rovo works Jira; its copies
 * run each task across the Teamwork Graph and ship code to the portal. Runs
 * continuously on a seed (`?seed=` in the URL); `?at=` opens the run that
 * many seconds in. No captions.
 */

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed')) || 3;
const at = Number(params.get('at')) || 0;

const stage = new Stage(document.getElementById('stage')!);
const scene = new RovoAtlassian(stage, seed);
// Framed on this seed's map, whichever way it's laid out.
stage.frame(scene.map.center, scene.map.viewSize);
void scene.start();
if (at > 0) void stage.skip({ seconds: at });

// Hover anything to highlight it; click it for its details on the right.
const inspector = new Inspector(stage, rovoInspectables(scene));
// Select Rovo or any copy: the drone family tree.
const family = new FamilyTree(stage, scene.rovo.drone, () => [...scene.copies.keys()]);
stage.onTick(() => family.focus(inspector.selected?.kind === 'agent' || inspector.selected?.kind === 'sub-agent'));

// Panel: a new seed reloads the run.
const gui = new GUI({ title: 'Sandbox' });
gui.add({ seed }, 'seed', 1, 999, 1).name('Seed').onFinishChange((value: number) => {
  location.search = `?seed=${value}`;
});

Object.assign(window, { sandbox: { stage, scene, inspector, family }, __stage: stage });
