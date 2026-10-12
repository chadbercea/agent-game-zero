import { Vector3 } from 'three';
import { seededRandom } from '../core/scatter';
import type { SharedRun } from '../core/sharedRuns';
import { distanceToPolyline } from '../primitives/branch/gridPath';
import type { SystemKind } from '../primitives/node/emblems';
import { layoutSystems, TEAMWORK_LINKS } from './systemLayout';

/**
 * The map of a Rovo story, from its seed (ILI-1011): where everything on the
 * grid stands. The seed picks the arrangement, not just a few systems:
 *
 * - **Jira and the gate:** the gate stands diagonally off Jira, on any side.
 * - **The code side** (Bitbucket, Code search, the coding lanes, the output
 *   line, assembler, belt and portal) is one block, turned and mirrored as a
 *   whole round the gate, so it can grow out on any side and every line stays
 *   on the grid.
 * - **Slack** stands straight out from Jira on any free side, its glass
 *   gateway on the line between.
 * - **The user's terminal** stands near Jira, wherever there's room.
 * - **The mini systems** are laid out last round Jira by the house rules
 *   (systemLayout), clear of all of that, with a seeded spread.
 * - **Production** (when a story asks for it): past the portal, the way the
 *   code side flows, in three tiers of service slots (front, APIs, data).
 *   It turns with the code side.
 *
 * An arrangement whose parts crowd each other is passed over for the next,
 * so every seed still gives one map, the same every time.
 */
export interface StoryMap {
  seed: number;
  gate: Vector3;
  /** Where Rovo first shows up, alone, before it flies to its gate. */
  rovoStart: Vector3;
  jira: Vector3;
  userTerminal: Vector3;
  slack: SlackPlace;
  code: CodeSide;
  /** Every system's place: the mini systems (seeded) and the code side's. */
  places: Partial<Record<SystemKind, Vector3>>;
  /** Laid-out routes from Jira to each mini system. */
  routes: Partial<Record<SystemKind, readonly Vector3[]>>;
  /** Where a copy reading Figma through MCP builds its terminal (if Figma is on the map). */
  mcpAt?: Vector3;
  /** Where a monitoring tool stands, beside Jira Service Management (if JSM is on the map). */
  monitorAt?: Vector3;
  /** Production, past the portal (if the story asked for it). */
  production?: ProductionPlace;
  /** Everything fixed on the map that lines and systems keep clear of. */
  keepClear: Vector3[];
  /** What the camera frames: the map's middle, and how tall a view it needs. */
  center: Vector3;
  viewSize: number;
}

export interface SlackPlace {
  at: Vector3;
  /** From Jira toward Slack, along the grid. */
  out: Vector3;
  /** The gateway's run (from < to), and its two ends: the one toward Slack and the one toward Jira. */
  run: SharedRun;
  slackEnd: Vector3;
  jiraEnd: Vector3;
}

export interface CodeLanePlace {
  /** Where the coding copy works: the worktree's place. */
  spot: Vector3;
  terminal: Vector3;
  /** Terminal → repo, along the grid (joining the middle lane's run into the repo). */
  intoRepo: Vector3[];
}

export interface CodeSide {
  scm: Vector3;
  codesearch: Vector3;
  /** Downstream (lanes → repo → output) and across, both along the grid. */
  flow: Vector3;
  across: Vector3;
  lanes: CodeLanePlace[];
  assembler: Vector3;
  beltFrom: Vector3;
  beltLength: number;
  portal: Vector3;
  /** The side of the repo Jira's tie comes in on, leaving the others to the lanes and the output. */
  tieSide: Vector3;
}

export interface ProductionPlace {
  /** Where things come out of the portal, on its far side. */
  exit: Vector3;
  /** Service slots by tier: [the front], [APIs], [data], each tier across the flow. */
  tiers: Vector3[][];
  /** The code side's directions: downstream, and across. */
  flow: Vector3;
  across: Vector3;
  /** Halfway between tiers, along the flow: where lines between tiers turn. */
  tierGap: number;
  /** How far apart slots in a tier stand. */
  slotGap: number;
}

export interface StoryMapOptions {
  /** The mini systems this story uses, laid out round Jira. */
  mini: readonly SystemKind[];
  /** Lay out production past the portal. */
  production?: boolean;
}

/** How close parts of different groups (hub, Slack, code side) may stand. */
const ROOM = 2.5;
/** How close a part may stand to another group's line. */
const LINE_ROOM = 1.5;
/** How far out the mini systems' ring starts from Jira, and how much the seed adds. */
const MINI_NEAR = 3.5;
const MINI_SPREAD = 2;
/** How far an MCP terminal stands from Figma. */
const MCP_OUT = 2.5;

/** Production in the code side's frame (u downstream, v across): three tiers past the portal. */
const PRODUCTION = {
  exitU: 13.75,
  tierU: [16, 19, 22],
  slotV: [-1.5, -5, -8.5],
  frontV: -5,
} as const;

/**
 * The code side in its own frame: `u` downstream, `v` across, from the gate
 * (this is the original layout, gate at the origin, flowing along +x).
 */
const CODE = {
  scm: [7, -5],
  codesearch: [7, -8],
  laneV: [-5, -3, -7],
  worktreeU: 1.5,
  terminalU: 4,
  mergeU: 5.3,
  assembler: [9.5, -5],
  beltFrom: [10.4, -5],
  beltLength: 2.2,
  portal: [13.2, -5],
} as const;

const GRID_DIRS = [new Vector3(1, 0, 0), new Vector3(0, 0, 1), new Vector3(-1, 0, 0), new Vector3(0, 0, -1)];

export function storyMap(seed: number, options: StoryMapOptions): StoryMap {
  const random = seededRandom(seed * 7919 + 17);
  const shuffled = <T>(items: readonly T[]): T[] => {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  // Every arrangement, in this seed's order: the gate's corner off Jira, the code side's turn and mirror, Slack's side.
  const gates = shuffled([
    [-3, 3],
    [3, 3],
    [-3, -3],
    [3, -3],
    [-4, 3],
    [3, -4],
  ]);
  const turns = shuffled([0, 1, 2, 3].flatMap((turn) => [false, true].map((mirror) => ({ turn, mirror }))));
  const sides = shuffled(GRID_DIRS);
  // The user's terminal stands on the camera's side of Jira, never behind it (or behind Rovo over it).
  const terminals = shuffled([
    [2, 3],
    [3, 2],
    [-2, 3],
    [3, -2],
    [1, 3],
    [3, 1],
  ]);
  for (const [gx, gz] of gates) {
    for (const { turn, mirror } of turns) {
      for (const out of sides) {
        const map = arrange(seed, random, options, new Vector3(gx, 0, gz), turn, mirror, out, terminals);
        if (map) return map;
      }
    }
  }
  throw new Error(`storyMap: no arrangement fits for seed ${seed}`);
}

function arrange(
  seed: number,
  random: () => number,
  options: StoryMapOptions,
  gateOffset: Vector3,
  turn: number,
  mirror: boolean,
  slackOut: Vector3,
  terminalOffsets: number[][],
): StoryMap | null {
  // Jira at the origin; everything else from there.
  const jira = new Vector3(0, 0, 0);
  const gate = jira.clone().sub(gateOffset);
  const flow = GRID_DIRS[turn].clone();
  const across = GRID_DIRS[(turn + 1) % 4].clone().multiplyScalar(mirror ? -1 : 1);
  const at = (u: number, v: number) => gate.clone().addScaledVector(flow, u).addScaledVector(across, v);
  const code: CodeSide = {
    scm: at(CODE.scm[0], CODE.scm[1]),
    codesearch: at(CODE.codesearch[0], CODE.codesearch[1]),
    flow,
    across,
    lanes: CODE.laneV.map((v) => {
      const terminal = at(CODE.terminalU, v);
      const scm = at(CODE.scm[0], CODE.scm[1]);
      const intoRepo = v === CODE.scm[1] ? [terminal, scm] : [terminal, at(CODE.mergeU, v), at(CODE.mergeU, CODE.scm[1]), scm];
      return { spot: at(CODE.worktreeU, v), terminal, intoRepo };
    }),
    assembler: at(CODE.assembler[0], CODE.assembler[1]),
    beltFrom: at(CODE.beltFrom[0], CODE.beltFrom[1]),
    beltLength: CODE.beltLength,
    portal: at(CODE.portal[0], CODE.portal[1]),
    tieSide: across.clone(),
  };
  const codeParts = [
    code.scm,
    code.codesearch,
    ...code.lanes.flatMap((l) => [l.spot, l.terminal, ...l.intoRepo]),
    code.assembler,
    code.beltFrom.clone().addScaledVector(flow, CODE.beltLength / 2),
    code.portal,
  ];
  const codeLines = [
    ...code.lanes.map((l) => [l.spot, ...l.intoRepo]),
    [code.scm, code.portal],
    [code.scm, code.codesearch],
  ];
  let production: ProductionPlace | undefined;
  if (options.production) {
    const [front, apis, data] = PRODUCTION.tierU;
    production = {
      exit: at(PRODUCTION.exitU, PRODUCTION.frontV),
      tiers: [[at(front, PRODUCTION.frontV)], PRODUCTION.slotV.map((v) => at(apis, v)), PRODUCTION.slotV.map((v) => at(data, v))],
      flow,
      across,
      tierGap: (apis - front) / 2,
      slotGap: Math.abs(PRODUCTION.slotV[1] - PRODUCTION.slotV[0]),
    };
    // Its whole block keeps clear of the rest: every slot, the room replicas take beside them, and the lines between.
    const [v0, , v2] = PRODUCTION.slotV;
    const edge = production.slotGap / 2;
    for (const u of PRODUCTION.tierU) for (const v of [v0 - edge, ...PRODUCTION.slotV, v2 + edge]) codeParts.push(at(u, v));
    codeLines.push([code.portal, at(front, PRODUCTION.frontV)], [at(front, v0 - edge), at(data, v0 - edge)], [at(front, v2 + edge), at(data, v2 + edge)]);
  }

  // Slack: straight out from Jira, the gateway on its line.
  const slackAt = jira.clone().addScaledVector(slackOut, 10);
  const slackEnd = jira.clone().addScaledVector(slackOut, 8);
  const jiraEnd = jira.clone().addScaledVector(slackOut, 6);
  const alongX = slackOut.x !== 0;
  const s0 = alongX ? slackEnd.x : slackEnd.z;
  const s1 = alongX ? jiraEnd.x : jiraEnd.z;
  const acrossAt = alongX ? jira.z : jira.x;
  const slack: SlackPlace = {
    at: slackAt,
    out: slackOut.clone(),
    run: { along: alongX ? 'x' : 'z', from: Math.min(s0, s1), to: Math.max(s0, s1), low: acrossAt, high: acrossAt },
    slackEnd,
    jiraEnd,
  };
  const slackLine = [jira, slackAt];

  // Rovo's way in: out of the gate, round one corner, into Jira.
  const accessCorner = new Vector3(gate.x, 0, jira.z);
  const accessLine = [gate, accessCorner, jira];
  const hubParts = [jira, gate, accessCorner];

  // Groups must keep their distance from each other's parts and lines.
  const apart = (a: Vector3[], b: Vector3[]) => a.every((p) => b.every((q) => p.distanceTo(q) >= ROOM));
  const offLines = (parts: Vector3[], lines: Vector3[][]) =>
    parts.every((p) => lines.every((line) => distanceToPolyline(p.x, p.z, line) >= LINE_ROOM));
  if (!apart(codeParts, [...hubParts, slackAt, slackEnd, jiraEnd])) return null;
  if (!offLines(codeParts, [accessLine, slackLine])) return null;
  if (!offLines([gate, slackAt], codeLines)) return null;
  if (!offLines([gate], [slackLine]) || !offLines([slackAt, slackEnd, jiraEnd], [accessLine])) return null;
  // Rovo's start, toward the camera from its gate, must be open floor.
  const rovoStart = gate.clone().add(new Vector3(3.5, 0, 3.5));
  if (!offLines([rovoStart], [...codeLines, slackLine])) return null;

  // The user's terminal: near Jira, wherever there's room.
  const lines = [accessLine, slackLine, ...codeLines];
  const taken = [...hubParts, slackAt, slackEnd, jiraEnd, ...codeParts];
  const userTerminal = terminalOffsets
    .map(([x, z]) => jira.clone().add(new Vector3(x, 0, z)))
    .find((p) => taken.every((q) => p.distanceTo(q) >= ROOM) && offLines([p], lines));
  if (!userTerminal) return null;

  // Keep clear: every part, and points along every line, so mini systems and their routes stay off them.
  const along = (line: Vector3[]) =>
    line.slice(1).flatMap((b, i) => {
      const a = line[i];
      const n = Math.max(1, Math.round(a.distanceTo(b) / 1.5));
      return Array.from({ length: n + 1 }, (_, k) => a.clone().lerp(b, k / n));
    });
  const keepClear = [gate, accessCorner, userTerminal, slackAt, ...along(slackLine).slice(2), ...codeParts, ...codeLines.flatMap(along)];

  // The mini systems round Jira, laid out last.
  const places: Partial<Record<SystemKind, Vector3>> = { github: code.scm, bitbucket: code.scm, gitlab: code.scm, codesearch: code.codesearch };
  const routes: Partial<Record<SystemKind, readonly Vector3[]>> = {};
  let mcpAt: Vector3 | undefined;
  if (options.mini.length) {
    let layout;
    try {
      const near = MINI_NEAR + random() * MINI_SPREAD;
      layout = layoutSystems([{ gate: jira, kinds: options.mini, avoid: keepClear, near }], TEAMWORK_LINKS, seed * 31 + 7);
    } catch {
      return null;
    }
    const [mini] = layout.maps;
    options.mini.forEach((kind, i) => {
      places[kind] = mini.spots[i];
      routes[kind] = mini.routes[i];
    });
    if (options.mini.includes('figma')) {
      const figma = places.figma as Vector3;
      const others = [...keepClear, jira, ...mini.spots];
      const room = (spot: Vector3) =>
        Math.min(...others.map((o) => o.distanceTo(spot)), distanceToPolyline(spot.x, spot.z, (routes.figma ?? []) as Vector3[]) * 2);
      mcpAt = GRID_DIRS.map((w) => figma.clone().addScaledVector(w, MCP_OUT)).sort((a, b) => room(b) - room(a))[0];
    }
  }
  // A monitoring tool stands beside JSM, its line straight into JSM along the grid, wherever there's most room.
  let monitorAt: Vector3 | undefined;
  if (places.jsm) {
    const jsm = places.jsm;
    const others = [...keepClear, jira, ...(Object.values(places) as Vector3[]).filter((p) => p !== jsm)];
    const lines = Object.values(routes) as Vector3[][];
    const room = (spot: Vector3) => Math.min(...others.map((o) => o.distanceTo(spot)), ...lines.map((l) => distanceToPolyline(spot.x, spot.z, l) * 2));
    monitorAt = GRID_DIRS.map((w) => jsm.clone().addScaledVector(w, MCP_OUT)).sort((a, b) => room(b) - room(a))[0];
    if (room(monitorAt) < LINE_ROOM) return null;
  }

  const everything = [
    ...taken,
    userTerminal,
    rovoStart,
    ...Object.values(places),
    ...(mcpAt ? [mcpAt] : []),
    ...(monitorAt ? [monitorAt] : []),
  ] as Vector3[];
  const { center, viewSize } = frame(everything);
  return { seed, gate, rovoStart, jira, userTerminal, slack, code, places, routes, mcpAt, monitorAt, production, keepClear, center, viewSize };
}

/**
 * Frame the map for the fixed isometric camera: the middle of everything in
 * screen terms, and a view tall enough to hold it (wide maps count by a
 * 16:9 screen), with a margin for nodes, labels and drones.
 */
function frame(points: Vector3[]): { center: Vector3; viewSize: number } {
  // Screen right and screen up for the iso camera (looking down from (1, 1, 1)), on the floor.
  const right = (p: Vector3) => (p.x - p.z) / Math.SQRT2;
  const up = (p: Vector3) => -(p.x + p.z) / Math.sqrt(6);
  const rs = points.map(right);
  const us = points.map(up);
  const [r0, r1, u0, u1] = [Math.min(...rs), Math.max(...rs), Math.min(...us), Math.max(...us)];
  const cr = (r0 + r1) / 2;
  const cu = (u0 + u1) / 2;
  // Back to the floor point under that screen spot: x − z = cr·√2, x + z = −cu·√6.
  const sum = -cu * Math.sqrt(6);
  const diff = cr * Math.SQRT2;
  const center = new Vector3((sum + diff) / 2, 0.6, (sum - diff) / 2);
  const viewSize = Math.max(u1 - u0 + 3.5, (r1 - r0 + 3) / (16 / 9)) * 1.12;
  return { center, viewSize };
}
