import { Vector3 } from 'three';
import { Floor, gatewayUnit, squareAt, standUnits, type UnitToStand } from '../core/floor';
import { GATE_FOOTPRINT, NODE_FOOTPRINT } from '../core/grid';
import { seededRandom } from '../core/scatter';
import { type SharedRun, sharedRuns } from '../core/sharedRuns';
import { distanceToPolyline, trimPolyline } from '../primitives/branch/gridPath';
import type { SystemKind } from '../primitives/node/emblems';
import { TERMINAL_SIZE } from '../primitives/terminal/Terminal';
import { GATEWAY_SIDES, type GatewaySide, type PanelDirection } from '../primitives/unit/unitLayout';
import { isTwg } from './rovoTasks';
import { layoutSystems, SEED_TRIES, TEAMWORK_LINKS } from './systemLayout';

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
  /** Laid-out lines between linked mini systems (systemLayout's links: Datadog to PagerDuty to JSM), node center to node center. */
  links: MapLink[];
  /** Production, past the portal (if the story asked for it). */
  production?: ProductionPlace;
  /** PagerDuty's way to people (if PagerDuty is on the map): the on-call person's phone, and its lines to it and to Slack. */
  paging?: PagingPlace;
  /** Everything fixed on the map that lines and systems keep clear of. */
  keepClear: Vector3[];
  /**
   * Which way each node's panel lies (ILI-1073), by id: a system's kind
   * (`scm` for the repo, whichever it is), `lane0`… for the worktrees,
   * `server` and `tier{k}-{j}` for production's slots.
   */
  panels: Map<string, PanelDirection>;
  /** Which side of its run each secure gateway's panel lies: Slack's (`slack`) and production's (`production`). */
  gatewaySides: Map<string, GatewaySide>;
  /** The map's floor, every unit and line on it, for anything placed as the story runs. */
  floor: Floor;
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

/** A line the layout drew between two linked systems. */
export interface MapLink {
  a: SystemKind;
  b: SystemKind;
  line: Vector3[];
}

export interface PagingPlace {
  /** The on-call person's phone, registered with PagerDuty: straight off it along the grid. */
  phone: Vector3;
  /** PagerDuty → the phone, and PagerDuty → Slack, along the grid, node center to node center. */
  toPhone: Vector3[];
  toSlack: Vector3[];
}

export interface ProductionPlace {
  /** The glass tunnel releases cross into production through: its run, and its ends (in from the assembler, out toward the server). */
  tunnel: SharedRun;
  tunnelIn: Vector3;
  tunnelOut: Vector3;
  /** The production server releases are shipped to: it runs the services. */
  server: Vector3;
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
  /** Lay out PagerDuty, Datadog beside it and the on-call person's phone, with PagerDuty's lines to Jira and Slack. */
  paging?: boolean;
  /** Lay out production: the tunnel past the assembler, the production server, its services. */
  production?: boolean;
}

/** How close parts of different groups (hub, Slack, code side) may stand. */
const ROOM = 2.5;
/** How close a part may stand to another group's line. */
const LINE_ROOM = 1.5;
/** How far out the mini systems' ring starts from Jira, and how much the seed adds. */
const MINI_NEAR = 3.5;
const MINI_SPREAD = 1.5;
/** How far Slack stands out from Jira, closest first (farther only where close doesn't fit); its gateway (2 long) sits on the line between, a little short of Slack. */
const SLACK_OUT = [6.5, 8, 9.5];
/** Arrangements that fit, tried before the most compact is chosen: just the first, now that units leave fewer that fit (each seed still gets its own). */
const CANDIDATES = 2;
/** How far an MCP terminal stands from Figma. */
const MCP_OUT = 2.5;
/** How far Jira's line to the repo keeps from anything standing: a clear node's width past its edge. */
const TIE_ROOM = 1.6;
/** The least it may keep: clear of a node's edge. */
const TIE_MIN = 1.2;
/** Every line sets off from Jira: near it, lines may run together. */
const JIRA_FAN = 2;
/** Ways for Jira's line to the repo tried before the mini systems are laid out freely. */
const TIE_TRIES = 1;
/** Where Rovo first shows up, off its gate toward the camera: the first of these on open floor. */
const ROVO_STARTS = [
  [3.5, 3.5],
  [2.5, 4.5],
  [4.5, 2.5],
];
/** Farthest PagerDuty stands from Jira. */
const PAGER_REACH = 12;
/** How far Datadog and the on-call person's phone stand off PagerDuty. */
const PHONE_OUT = 2.5;

/**
 * Production in the code side's frame (u downstream, v across): past the
 * assembler (no belt), the glass tunnel; past that, the production server; then its
 * services in three tiers (the front, APIs, data). Spaced so every node's
 * unit (ILI-1073) fits whichever way the code side turns, with room for any
 * caller-to-callee line between tiers.
 */
const PRODUCTION = {
  tunnelU: [12.8, 14.8],
  serverU: 18.5,
  tierU: [22.5, 27.5, 32.5],
  slotV: [-3, -6.5, -10],
  frontV: -6.5,
} as const;

/**
 * The code side in its own frame: `u` downstream, `v` across, from the gate
 * (this is the original layout, gate at the origin, flowing along +x).
 * Spaced so every node's unit, panel and all, fits whichever way it turns.
 */
const CODE = {
  scm: [8.5, -6.5],
  codesearch: [8.5, -10.5],
  laneV: [-6.5, -3, -10],
  worktreeU: 1.5,
  terminalU: 4.5,
  mergeU: 6,
  assembler: [11.5, -6.5],
  beltFrom: [12.4, -6.5],
  beltLength: 1.8,
  portal: [14.8, -6.5],
} as const;

/** How wide each kind stands: Jira as the hub, a Teamwork Graph app a size up, the rest plain (rovoSystems, jiraHub). */
const HUB_SCALE = 1.35;
function unitSize(kind: SystemKind): number {
  return NODE_FOOTPRINT * (kind === 'jira' ? HUB_SCALE : isTwg(kind) ? TWG_SCALE : 1);
}
/** Jira's task board floats here off it (jiraHub's BOARD_OUT), over this much floor. */
const BOARD_OUT = new Vector3(-0.45, 0, 1.6);
const BOARD_FLOOR = 1.2;
/** The on-call person's phone, on the floor. */
const PHONE_FLOOR = 0.6;
/** What stands without a panel, for keeping units off it: the assembler, the portal, a glass run's width. */
const ASSEMBLER_SIZE = 1.2;
const PORTAL_SIZE = 1.3;
/** How wide a secure gateway stands across its run. */
export const GATEWAY_WIDTH = 1;
/** A Teamwork Graph app stands this much bigger (rovoSystems' TWG_SCALE). */
const TWG_SCALE = 1.2;

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
    [4, 4],
    [-4, 4],
    [4, -4],
    [-4, -4],
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
    [0, 3],
    [-1, 3],
  ]);
  // The first few that fit, in the seed's order; the most compact of them is the map (the seed still picks which few).
  // The mini systems get a few seeds each; only if nothing fits that way is every arrangement tried again, patiently.
  const fits: StoryMap[] = [];
  for (const tries of [undefined, SEED_TRIES]) {
    search: for (const [gx, gz] of gates) {
      for (const { turn, mirror } of turns) {
        for (const out of sides) {
          for (const slackOut of SLACK_OUT) {
            const map = arrange(seed, random, options, new Vector3(gx, 0, gz), turn, mirror, out, slackOut, terminals, tries);
            if (!map) continue;
            fits.push(map);
            if (fits.length >= CANDIDATES) break search;
            break;
          }
        }
      }
    }
    if (fits.length) break;
  }
  if (!fits.length) throw new Error(`storyMap: no arrangement fits for seed ${seed}`);
  return fits.reduce((best, m) => (m.viewSize < best.viewSize ? m : best));
}

function arrange(
  seed: number,
  random: () => number,
  options: StoryMapOptions,
  gateOffset: Vector3,
  turn: number,
  mirror: boolean,
  slackOut: Vector3,
  slackDistance: number,
  terminalOffsets: number[][],
  tries?: number,
): StoryMap | null {
  // Jira at the origin; everything else from there.
  const jira = new Vector3(0, 0, 0);
  const gate = jira.clone().sub(gateOffset);
  const side = layCodeSide(gate, turn, mirror, Boolean(options.production));
  if (!side) return null;
  const { code, production, parts: codeParts, lines: codeLines } = side;
  // Slack: straight out from Jira, the gateway on its line.
  const slackAt = jira.clone().addScaledVector(slackOut, slackDistance);
  const slackEnd = jira.clone().addScaledVector(slackOut, slackDistance - 1.5);
  const jiraEnd = jira.clone().addScaledVector(slackOut, slackDistance - 3.5);
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
  const rovoStart = ROVO_STARTS.map(([x, z]) => gate.clone().add(new Vector3(x, 0, z))).find((p) => offLines([p], [...codeLines, slackLine]));
  if (!rovoStart) return null;

  // The floor (ILI-1073): the code side's, then the glass gateway and the lines, then the gate's, Jira's and Slack's units.
  // Jira's panel lies along +x: the task board floats over the floor on its other side.
  let floor = side.floor.fork();
  floor.addLine(accessLine);
  floor.addLine(slackLine);
  const hub = standUnits(floor, [
    { id: 'gate', at: gate, size: GATE_FOOTPRINT },
    { id: 'jira', at: jira, size: NODE_FOOTPRINT * HUB_SCALE },
    { id: 'slack', at: slackAt, size: NODE_FOOTPRINT },
  ], (u) => (u.id === 'jira' ? ['x'] : ['x', 'z']));
  if (!hub) return null;
  floor = hub.floor;
  const slackSide = standGateway(floor, slack.run);
  if (!slackSide) return null;
  const gatewaySides = new Map<string, GatewaySide>([['slack', slackSide]]);
  if (side.productionSide) gatewaySides.set('production', side.productionSide);
  floor.addPart(squareAt(jira.clone().add(BOARD_OUT), BOARD_FLOOR));
  const panels = new Map([...side.panels, ...hub.ways]);

  // The user's terminal: near Jira, wherever there's room.
  const lines = [accessLine, slackLine, ...codeLines];
  const taken = [...hubParts, slackAt, slackEnd, jiraEnd, ...codeParts];
  const userTerminal = terminalOffsets
    .map(([x, z]) => jira.clone().add(new Vector3(x, 0, z)))
    .find((p) => taken.every((q) => p.distanceTo(q) >= ROOM) && offLines([p], lines) && floor.partFits(squareAt(p, TERMINAL_SIZE)));
  if (!userTerminal) return null;
  floor.addPart(squareAt(userTerminal, TERMINAL_SIZE));

  // Keep clear: every part, and points along every line, so mini systems and their routes stay off them.
  const along = (line: Vector3[]) =>
    line.slice(1).flatMap((b, i) => {
      const a = line[i];
      const n = Math.max(1, Math.round(a.distanceTo(b) / 1.5));
      return Array.from({ length: n + 1 }, (_, k) => a.clone().lerp(b, k / n));
    });
  const keepClear = [
    gate,
    accessCorner,
    userTerminal,
    slackAt,
    ...along(slackLine).slice(2),
    ...codeParts,
    ...codeLines.flatMap(along),
  ];

  /** Everything standing that Jira's line to the repo keeps clear of, with `more` (the mini systems, once placed). */
  const standingFor = (more: Vector3[]) =>
    [gate, accessCorner, userTerminal, slackAt, slackEnd, jiraEnd, ...codeParts, ...more].filter((p) => p.distanceTo(code.scm) > 1e-6);
  let repoTie: Vector3[] | null = null;

  // The mini systems round Jira, laid out last.
  const places: Partial<Record<SystemKind, Vector3>> = { github: code.scm, bitbucket: code.scm, gitlab: code.scm, codesearch: code.codesearch };
  const routes: Partial<Record<SystemKind, readonly Vector3[]>> = {};
  let mcpAt: Vector3 | undefined;
  const links: MapLink[] = [];
  if (options.mini.length) {
    // First they're laid out round Jira's line to the repo (routed now, with nothing else in the way), keeping clear of it;
    // if they can't fit that way, they're laid out freely and the line is routed round them after.
    const near = MINI_NEAR + random() * MINI_SPREAD;
    const lay = (keepOff: Vector3[][], on: Floor) => {
      try {
        return layoutSystems(
          [{ gate: jira, kinds: options.mini, avoid: keepClear, near, keepOff, floor: on, sizeOf: unitSize, waysOf: () => (random() < 0.5 ? ['x', 'z'] : ['z', 'x']) }],
          TEAMWORK_LINKS,
          seed * 31 + 7,
          undefined,
          tries,
        );
      } catch {
        return undefined;
      }
    };
    // Nodes keep off it; their own lines may cross it. A few ways for it are tried, shortest first.
    let layout;
    for (const tie of tieRoutes(jira, code.scm, code.tieSide, standingFor([]), [accessLine, slackLine]).filter((l) => floor.lineFits(l)).slice(0, TIE_TRIES)) {
      const withTie = floor.fork();
      withTie.addLine(tie);
      layout = lay([trimPolyline(tie, JIRA_FAN, 0)], withTie);
      if (layout) {
        repoTie = tie;
        break;
      }
    }
    layout ??= lay([], floor);
    if (!layout?.floor) return null;
    floor = layout.floor;
    for (const [kind, way] of layout.ways) panels.set(kind, way);
    const [mini] = layout.maps;
    options.mini.forEach((kind, i) => {
      places[kind] = mini.spots[i];
      routes[kind] = mini.routes[i];
    });
    for (const [link, line] of layout.lines) links.push({ a: link.a, b: link.b, line });
    if (options.mini.includes('figma')) {
      const figma = places.figma as Vector3;
      const others = [...keepClear, jira, ...mini.spots];
      const room = (spot: Vector3) =>
        Math.min(...others.map((o) => o.distanceTo(spot)), distanceToPolyline(spot.x, spot.z, (routes.figma ?? []) as Vector3[]) * 2);
      mcpAt = GRID_DIRS.map((w) => figma.clone().addScaledVector(w, MCP_OUT))
        .filter((p) => floor.partFits(squareAt(p, TERMINAL_SIZE)) && floor.lineFits([p, figma]))
        .sort((a, b) => room(b) - room(a))[0];
      if (!mcpAt) return null;
      floor.addPart(squareAt(mcpAt, TERMINAL_SIZE));
      floor.addLine([mcpAt, figma]);
    }
  }

  // Jira's Graph Line to the repo (Bitbucket), if the mini systems didn't lay out round it: routed now, clear of
  // everything standing, so no system sits on it. If there's no clear way, the arrangement is passed over.
  if (!repoTie) {
    const otherLines = [accessLine, slackLine, ...(Object.values(routes) as Vector3[][])];
    const standing = standingFor([...(Object.values(places) as Vector3[]), ...(mcpAt ? [mcpAt] : [])]);
    repoTie = tieRoutes(jira, code.scm, code.tieSide, standing, otherLines).find((l) => floor.lineFits(l)) ?? null;
    if (repoTie) floor.addLine(repoTie);
  }
  if (!repoTie) return null;
  routes.bitbucket = repoTie;

  // PagerDuty alerts people where they are: in Jira, in Slack, and on the on-call person's phone. It's placed
  // where its lines to Jira and to Slack are shortest while clear of everything, with Datadog (whose alerts it
  // takes) and the phone each standing straight off it along the grid.
  let paging: PagingPlace | undefined;
  if (options.paging) {
    const lines = [accessLine, slackLine, ...(Object.values(routes) as Vector3[][])];
    const standing = standingFor([...(Object.values(places) as Vector3[]), ...(mcpAt ? [mcpAt] : [])]);
    const found = placePaging(jira, slackAt, standing, lines, TIE_ROOM, floor) ?? placePaging(jira, slackAt, standing, lines, TIE_MIN, floor);
    if (!found) return null;
    floor = found.floor;
    panels.set('pagerduty', found.pagerWay);
    panels.set('datadog', found.datadogWay);
    places.pagerduty = found.pager;
    places.datadog = found.datadog;
    routes.pagerduty = found.toJira;
    links.push({ a: 'datadog', b: 'pagerduty', line: [found.datadog, found.pager] });
    paging = { phone: found.phone, toPhone: [found.pager, found.phone], toSlack: found.toSlack };
  }

  const everything = [
    ...taken,
    userTerminal,
    rovoStart,
    ...Object.values(places),
    ...(mcpAt ? [mcpAt] : []),
    ...(paging ? [paging.phone, ...paging.toSlack, ...(routes.pagerduty ?? [])] : []),
  ] as Vector3[];
  // Every unit's border counts for the frame: panels reach out toward the camera.
  for (const r of floor.borders) everything.push(new Vector3(r.minX, 0, r.minZ), new Vector3(r.maxX, 0, r.maxZ), new Vector3(r.minX, 0, r.maxZ), new Vector3(r.maxX, 0, r.minZ));
  const { center, viewSize } = frame(everything);
  return { seed, gate, rovoStart, jira, userTerminal, slack, code, places, routes, mcpAt, links, production, paging, keepClear, panels, gatewaySides, floor, center, viewSize };
}

/** The code side (and production past it) laid out round its gate, with its floor: its parts, lines and units. */
export interface CodeLayout {
  code: CodeSide;
  production?: ProductionPlace;
  flow: Vector3;
  /** Points other groups keep their distance from (every part, and the room production's replicas take). */
  parts: Vector3[];
  /** Lines other groups keep off (with production's replica room as lines). */
  lines: Vector3[][];
  /** Its floor: what stands, the lines drawn, and each node's unit, panel and all. */
  floor: Floor;
  /** Which way each code-side node's panel lies, by id (UNIT ids: scm, codesearch, lane0…, server, tier-slot). */
  panels: Map<string, PanelDirection>;
  /** Which side production's secure gateway has its panel, if there's production. */
  productionSide?: GatewaySide;
}

/**
 * Lay the code side out from `gate`, turned (`turn`: a quarter turn each,
 * `mirror`ed across), and production past it if asked; then stand each node's
 * unit on its floor. Null if the units don't fit this way round.
 */
export function layCodeSide(gate: Vector3, turn: number, mirror: boolean, withProduction: boolean): CodeLayout | null {
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
  const parts = [
    code.scm,
    code.codesearch,
    ...code.lanes.flatMap((l) => [l.spot, l.terminal, ...l.intoRepo]),
    code.assembler,
    code.beltFrom.clone().addScaledVector(flow, CODE.beltLength / 2),
    code.portal,
  ];
  const drawn = [...code.lanes.map((l) => [l.spot, ...l.intoRepo]), [code.scm, code.portal], [code.scm, code.codesearch]];
  const lines = [...drawn];
  const floor = new Floor();
  for (const l of code.lanes) floor.addPart(squareAt(l.terminal, TERMINAL_SIZE));
  floor.addPart(squareAt(code.assembler, ASSEMBLER_SIZE));
  // With production there's no belt or portal: releases cross the secure gateway instead.
  if (!withProduction) floor.addPart(squareAt(code.portal, PORTAL_SIZE));
  const units: UnitToStand[] = [
    { id: 'scm', at: code.scm, size: NODE_FOOTPRINT * TWG_SCALE },
    { id: 'codesearch', at: code.codesearch, size: NODE_FOOTPRINT },
    ...code.lanes.map((l, i) => ({ id: `lane${i}`, at: l.spot, size: NODE_FOOTPRINT })),
  ];
  let production: ProductionPlace | undefined;
  if (withProduction) {
    const [front, apis, data] = PRODUCTION.tierU;
    const tunnelIn = at(PRODUCTION.tunnelU[0], PRODUCTION.frontV);
    const tunnelOut = at(PRODUCTION.tunnelU[1], PRODUCTION.frontV);
    const alongX = flow.x !== 0;
    const [s0, s1] = alongX ? [tunnelIn.x, tunnelOut.x] : [tunnelIn.z, tunnelOut.z];
    const acrossAt = alongX ? tunnelIn.z : tunnelIn.x;
    const server = at(PRODUCTION.serverU, PRODUCTION.frontV);
    production = {
      tunnel: { along: alongX ? 'x' : 'z', from: Math.min(s0, s1), to: Math.max(s0, s1), low: acrossAt, high: acrossAt },
      tunnelIn,
      tunnelOut,
      server,
      tiers: [[at(front, PRODUCTION.frontV)], PRODUCTION.slotV.map((v) => at(apis, v)), PRODUCTION.slotV.map((v) => at(data, v))],
      flow,
      across,
      tierGap: (apis - front) / 2,
      slotGap: Math.abs(PRODUCTION.slotV[1] - PRODUCTION.slotV[0]),
    };
    // Its whole block keeps clear of the rest: every slot, the room replicas take beside them, and the lines between.
    const [v0, , v2] = PRODUCTION.slotV;
    const edge = production.slotGap / 2;
    for (const u of PRODUCTION.tierU) for (const v of [v0 - edge, ...PRODUCTION.slotV, v2 + edge]) parts.push(at(u, v));
    parts.push(tunnelIn, tunnelOut, server);
    lines.push([code.portal, at(front, PRODUCTION.frontV)], [at(front, v0 - edge), at(data, v0 - edge)], [at(front, v2 + edge), at(data, v2 + edge)]);
    const frontAt = production.tiers[0][0];
    drawn.push([tunnelOut, server], [server, frontAt]);
    // Every caller-to-callee way between tiers (production draws the ones its incident uses).
    const tiers = production.tiers;
    for (let k = 0; k + 1 < tiers.length; k++)
      for (const a of tiers[k]) for (const b of tiers[k + 1]) drawn.push(tierWay(a, b, flow, production.tierGap));
    units.push({ id: 'server', at: server, size: NODE_FOOTPRINT });
    tiers.forEach((tier, k) => tier.forEach((p, j) => units.push({ id: `tier${k}-${j}`, at: p, size: NODE_FOOTPRINT })));
  }
  for (const line of drawn) floor.addLine(line);
  // The code side moves with its gate but never changes shape, so how its units fit is worked out once per turn.
  const key = `${turn} ${mirror} ${withProduction}`;
  if (!codeWays.has(key)) codeWays.set(key, standUnits(floor, units)?.ways ?? null);
  const ways = codeWays.get(key);
  if (!ways) return null;
  for (const u of units) floor.addUnit(u, ways.get(u.id) as PanelDirection);
  // Production's secure gateway, its panel on whichever side of it is clear.
  const productionSide = production ? standGateway(floor, production.tunnel) : undefined;
  if (production && !productionSide) return null;
  return { code, production, flow, parts, lines, floor, panels: new Map(ways), productionSide: productionSide ?? undefined };
}

/** How the code side's units fit, by turn, mirror and production: null where they don't. */
const codeWays = new Map<string, Map<string, PanelDirection> | null>();

/** Caller → callee between production tiers: out of the caller downstream, across at the halfway line, on into the callee. */
export function tierWay(a: Vector3, b: Vector3, flow: Vector3, tierGap: number): Vector3[] {
  const turnAt = a.clone().addScaledVector(flow, tierGap);
  const corner = b.clone().addScaledVector(flow, -tierGap);
  return corner.distanceTo(turnAt) < 1e-6 ? [a.clone(), b.clone()] : [a.clone(), turnAt, corner, b.clone()];
}

/** Stand a secure gateway's unit (the gateway and its panel; only its own line runs through it), its panel toward the camera if that's clear, else away; where the panel lies, or null if nowhere's clear. */
function standGateway(floor: Floor, run: SharedRun): GatewaySide | null {
  for (const side of GATEWAY_SIDES) {
    const { border, keepOff } = gatewayUnit(run, GATEWAY_WIDTH, side);
    if (!floor.gatewayFits(border, keepOff)) continue;
    floor.addGatewayUnit(border, keepOff);
    return side;
  }
  return null;
}

/**
 * Every way for Jira's line to the repo along the grid, best first: coming
 * into the repo from its tie side, round one corner or a three-leg detour,
 * shortest while well clear of `others` (TIE_ROOM, or at least TIE_MIN) and,
 * if it can, not running alongside another of `lines` (crossing is fine).
 */
function tieRoutes(jira: Vector3, repo: Vector3, tieSide: Vector3, others: Vector3[], lines: Vector3[][]): Vector3[][] {
  const approach = repo.clone().addScaledVector(tieSide, 2);
  const options: Vector3[][] = [
    [jira.clone(), new Vector3(approach.x, 0, jira.z), approach, repo.clone()],
    [jira.clone(), new Vector3(jira.x, 0, approach.z), approach, repo.clone()],
  ];
  for (let k = -6; k <= 6; k += 0.5) {
    const midX = Math.round((jira.x + approach.x) / 2 + k);
    const midZ = Math.round((jira.z + approach.z) / 2 + k);
    options.push([jira.clone(), new Vector3(midX, 0, jira.z), new Vector3(midX, 0, approach.z), approach, repo.clone()]);
    options.push([jira.clone(), new Vector3(jira.x, 0, midZ), new Vector3(approach.x, 0, midZ), approach, repo.clone()]);
  }
  const all = options.map((l) => l.filter((p, i) => i === 0 || p.distanceTo(l[i - 1]) > 1e-6));
  // Its last leg comes straight in from the tie side (never doubling back over the repo).
  const fair = all.filter((l) => {
    const before = l[l.length - 3];
    return !before || before.clone().sub(approach).dot(tieSide) >= -1e-6;
  });
  const clear = (line: Vector3[]) => Math.min(Infinity, ...others.map((p) => distanceToPolyline(p.x, p.z, line)));
  const length = (line: Vector3[]) => line.reduce((sum, p, i) => sum + (i ? p.distanceTo(line[i - 1]) : 0), 0);
  const away = (line: Vector3[]) => (line[0].distanceTo(jira) < 1e-6 ? trimPolyline(line, JIRA_FAN, 0) : line);
  const alongside = (line: Vector3[]) => lines.some((other) => sharedRuns([away(line), away(other)]).length > 0);
  // Best: roomy and on its own; then roomy; then at least clear of every node.
  const roomy = fair.filter((l) => clear(l) >= TIE_ROOM);
  const tiers = [roomy.filter((l) => !alongside(l)), roomy, fair.filter((l) => clear(l) >= TIE_MIN)];
  const pick = tiers.find((t) => t.length);
  return pick ? pick.sort((a, b) => length(a) - length(b)) : [];
}

/**
 * Where PagerDuty stands: the spot (on the grid, 3.5–PAGER_REACH from Jira) whose lines
 * to Jira and to Slack are shortest while keeping `room` from everything
 * standing and never running alongside another line, with two free sides
 * where Datadog and the phone stand, PHONE_OUT straight off it. Null if none.
 */
function placePaging(
  jira: Vector3,
  slack: Vector3,
  standing: Vector3[],
  lines: Vector3[][],
  room: number,
  floor: Floor,
): { pager: Vector3; datadog: Vector3; phone: Vector3; toJira: Vector3[]; toSlack: Vector3[]; pagerWay: PanelDirection; datadogWay: PanelDirection; floor: Floor } | null {
  const spots: Vector3[] = [];
  for (let x = -PAGER_REACH; x <= PAGER_REACH; x += 0.5) {
    for (let z = -PAGER_REACH; z <= PAGER_REACH; z += 0.5) {
      const spot = new Vector3(x + jira.x, 0, z + jira.z);
      const r = spot.distanceTo(jira);
      if (r < MINI_NEAR || r > PAGER_REACH) continue;
      // Room for its unit at all (its lines come later).
      if (!floor.wayFor({ at: spot, size: NODE_FOOTPRINT }, ['x', 'z'])) continue;
      if (standing.some((p) => p.distanceTo(spot) < ROOM)) continue;
      if (lines.some((l) => distanceToPolyline(spot.x, spot.z, l) < LINE_ROOM)) continue;
      spots.push(spot);
    }
  }
  // Shortest lines first: grid distance to Jira and to Slack.
  const grid = (a: Vector3, b: Vector3) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
  spots.sort((a, b) => grid(a, jira) + grid(a, slack) - (grid(b, jira) + grid(b, slack)));
  const clearOf = (line: Vector3[], others: Vector3[]) =>
    Math.min(Infinity, ...others.filter((p) => p.distanceTo(line[0]) > 1e-6 && p.distanceTo(line[line.length - 1]) > 1e-6).map((p) => distanceToPolyline(p.x, p.z, line)));
  const middle = (line: Vector3[]) => trimPolyline(line, 1, 1);
  const alone = (line: Vector3[], others: Vector3[][]) => others.every((o) => sharedRuns([middle(line), o]).length === 0);
  for (const pager of spots.slice(0, 120)) {
    // Shortest first, the first way that fits (checked one at a time: most spots fail fast).
    const toJira = gridOptions(jira, pager).find((l) => clearOf(l, standing) >= room && alone(l, lines) && floor.lineFits(l));
    if (!toJira) continue;
    const toSlack = gridOptions(pager, slack).find((l) => clearOf(l, standing) >= room && alone(l, [...lines, toJira]) && floor.lineFits(l));
    if (!toSlack) continue;
    // Its unit: a way for its panel clear of the floor, its two lines coming in.
    const pagerSpot = { at: pager, size: NODE_FOOTPRINT };
    const pagerWay = floor.wayFor(pagerSpot, ['x', 'z'], [toJira, toSlack]);
    if (!pagerWay) continue;
    const withPager = floor.fork();
    withPager.addUnit(pagerSpot, pagerWay);
    withPager.addLine(toJira);
    withPager.addLine(toSlack);
    // The sides its own lines leave by are taken; Datadog and the phone stand straight off two of the others.
    const leaving = [toJira[toJira.length - 2], toSlack[1]].map((p) => p.clone().sub(pager).normalize());
    const mine = [toJira, toSlack];
    const sides = GRID_DIRS.filter((d) => leaving.every((l) => l.dot(d) < 0.99))
      .map((d) => pager.clone().addScaledVector(d, PHONE_OUT))
      .filter(
        (p) =>
          standing.every((q) => q.distanceTo(p) >= ROOM) &&
          [...lines, ...mine].every((l) => distanceToPolyline(p.x, p.z, l) >= LINE_ROOM) &&
          clearOf([pager, p], standing) >= room,
      );
    // Datadog as a unit, its line into PagerDuty; then the phone, standing clear, with its line.
    for (const datadog of sides) {
      const ddSpot = { at: datadog, size: NODE_FOOTPRINT };
      const datadogWay = withPager.wayFor(ddSpot, ['x', 'z'], [[datadog, pager]]);
      if (!datadogWay) continue;
      const done = withPager.fork();
      done.addUnit(ddSpot, datadogWay);
      done.addLine([datadog, pager]);
      const phone = sides.find((p) => p !== datadog && done.partFits(squareAt(p, PHONE_FLOOR)) && done.lineFits([pager, p]));
      if (!phone) continue;
      done.addPart(squareAt(phone, PHONE_FLOOR));
      done.addLine([pager, phone]);
      return { pager, datadog, phone, toJira, toSlack, pagerWay, datadogWay, floor: done };
    }
  }
  return null;
}

/**
 * Between two things along the grid: round one corner, or a three-leg detour,
 * best first: well clear of `others` (TIE_ROOM, or at least TIE_MIN) and, if
 * it can, not running alongside one of `lines`; failing that, the clearest.
 */
export function gridWays(from: Vector3, to: Vector3, others: Vector3[], lines: Vector3[][]): Vector3[][] {
  const all = gridOptions(from, to);
  const near = others.filter((p) => p.distanceTo(from) > 1e-6 && p.distanceTo(to) > 1e-6);
  const clear = (line: Vector3[]) => Math.min(Infinity, ...near.map((p) => distanceToPolyline(p.x, p.z, line)));
  // Its own ends may meet other lines (they set off from the same things); in between it keeps to itself.
  const middle = (line: Vector3[]) => trimPolyline(line, 1, 1);
  const alongside = (line: Vector3[]) => lines.some((other) => sharedRuns([middle(line), other]).length > 0);
  const roomy = all.filter((l) => clear(l) >= TIE_ROOM);
  const tiers = [roomy.filter((l) => !alongside(l)), roomy, all.filter((l) => clear(l) >= TIE_MIN)];
  const pick = tiers.find((t) => t.length);
  // Failing all of that, the clearest way there is.
  return pick ?? [...all].sort((a, b) => clear(b) - clear(a));
}

/** Every way between two things along the grid (round one corner, or a three-leg detour), shortest first. */
export function gridOptions(from: Vector3, to: Vector3): Vector3[][] {
  const options: Vector3[][] = [
    [from.clone(), new Vector3(to.x, 0, from.z), to.clone()],
    [from.clone(), new Vector3(from.x, 0, to.z), to.clone()],
  ];
  for (let k = -6; k <= 6; k += 0.5) {
    const midX = Math.round((from.x + to.x) / 2 + k);
    const midZ = Math.round((from.z + to.z) / 2 + k);
    options.push([from.clone(), new Vector3(midX, 0, from.z), new Vector3(midX, 0, to.z), to.clone()]);
    options.push([from.clone(), new Vector3(from.x, 0, midZ), new Vector3(to.x, 0, midZ), to.clone()]);
  }
  const length = (line: Vector3[]) => line.reduce((sum, p, i) => sum + (i ? p.distanceTo(line[i - 1]) : 0), 0);
  return options.map((l) => l.filter((p, i) => i === 0 || p.distanceTo(l[i - 1]) > 1e-6)).sort((a, b) => length(a) - length(b));
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
  const viewSize = Math.max(u1 - u0 + 3, (r1 - r0 + 2.5) / (16 / 9)) * 1.04;
  return { center, viewSize };
}
