import { Vector3 } from 'three';
import { hashSeed } from '../core/scatter';
import type { SharedRun } from '../core/sharedRuns';
import { ATLASSIAN_KINDS, JOB_KINDS } from '../primitives/node/emblems';
import { layoutSystems, type SystemsLayout, TEAMWORK_LINKS } from './systemLayout';

/**
 * Where everything sits on the one isometric grid for the two-act story.
 * Act 1's gate leads to Notion, Figma and GitHub; the Atlassian gate sits to
 * the right on screen (along the screen-right diagonal) with its four tools,
 * far enough that the two maps never overlap. Every position is on the grid.
 */
export const ACT1_GATE = new Vector3(2, 0, 2);
export const ATLASSIAN_GATE = new Vector3(10, 0, -6);
export const HOME = new Vector3(-1.8, 0, 5);
/** Rovo, the Atlassian side's own agent, waits off to the right of its gate. */
export const ROVO_HOME = new Vector3(13.5, 0, -9.5);
/** The security bot comes in from the back of the grid. */
export const SECURITY_HOME = new Vector3(3, 0, -10);
/**
 * The secure gateway: one glass tunnel on the grid between the two systems,
 * six squares long and three lanes wide (one feeder per lane at each end),
 * centered between the gates. Reserved before the layout runs, so nodes and
 * their gate lines keep clear of it.
 */
export const GATEWAY: SharedRun = { along: 'x', from: 4.5, to: 7.5, low: -2.5, high: -1.5 };
/** Points over the gateway, every half square: what the layout keeps clear of. */
const GATEWAY_KEEPOUT = Array.from({ length: Math.round((GATEWAY.to - GATEWAY.from) / 0.5) + 1 }, (_, i) =>
  [GATEWAY.low, (GATEWAY.low + GATEWAY.high) / 2, GATEWAY.high].map((z) => new Vector3(GATEWAY.from + i * 0.5, 0, z)),
).flat();
/** Screen-space middle of both maps, for framing the whole story. */
export const STORY_CENTER = new Vector3(6, 0, -2);
/**
 * Both systems laid out together, meaning first (see layoutSystems): the
 * third-party tools behind the first gate, Atlassian's behind the second, each
 * node aimed at the systems the Teamwork Graph links it to (across systems:
 * at its side of the secure gateway, which every cross-system link goes
 * through), then the seed.
 */
export function storyLayout(seed = hashSeed('teamwork-graph')): SystemsLayout {
  return layoutSystems(
    [
      {
        gate: ACT1_GATE,
        kinds: JOB_KINDS,
        avoid: [ATLASSIAN_GATE, HOME, ROVO_HOME, SECURITY_HOME, ...GATEWAY_KEEPOUT],
      },
      {
        gate: ATLASSIAN_GATE,
        kinds: ATLASSIAN_KINDS,
        avoid: [ACT1_GATE, HOME, ROVO_HOME, SECURITY_HOME, ...GATEWAY_KEEPOUT],
      },
    ],
    TEAMWORK_LINKS,
    seed,
    GATEWAY,
  );
}
