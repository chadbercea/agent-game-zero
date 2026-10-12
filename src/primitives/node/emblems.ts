import {
  BoxGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  type Material,
  type Object3D,
  QuadraticBezierCurve3,
  Shape,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { solid } from '../../core/mesh';

/** Systems with a job animation. Every source code manager works like GitHub: a branch grows. */
export type JobKind = 'figma' | 'github' | 'notion' | 'bitbucket' | 'gitlab';
/** Act 2 systems, behind the Atlassian gate: their work flows through the Teamwork Graph instead. */
export type AtlassianKind = 'codesearch' | 'confluence' | 'jira' | 'bitbucket';
/** Third-party trackers: where a ticket lives outside Atlassian. No job animation. */
export type TrackerKind = 'linear';
/** Third-party docs outside Atlassian and Notion. */
export type DocsKind = 'gdocs';
/** Third-party source code managers beyond GitHub. */
export type CodeHostKind = 'gitlab';
/** Comms: messages in and out. */
export type CommsKind = 'slack';
/** Where code is written: a worktree, a checkout of the repo a coding agent works in. */
export type WorkspaceKind = 'worktree';
/** Atlassian's incident apps (Rovo on Call): the service desk, the service catalog, and the public status page. */
export type IncidentKind = 'jsm' | 'compass' | 'statuspage';
/** Third-party monitoring: where an alert can come from. */
export type MonitorKind = 'datadog' | 'grafana';
/** Third-party paging: an alert becomes a page to the human on call. */
export type PagingKind = 'pagerduty';
/** Production: the server releases are shipped to, and the services it runs. Their light is their health. */
export type ServiceKind = 'server' | 'web' | 'api' | 'db' | 'cache' | 'queue';
/** The systems a gate can lead to. */
export type SystemKind =
  | JobKind
  | AtlassianKind
  | TrackerKind
  | DocsKind
  | CodeHostKind
  | CommsKind
  | WorkspaceKind
  | IncidentKind
  | MonitorKind
  | PagingKind
  | ServiceKind;

/** Act 1 systems (outside Atlassian). */
export const JOB_KINDS: readonly JobKind[] = ['figma', 'github', 'notion'];
/** Every system with a job animation: Act 1's, plus Bitbucket (a branch grows, as in GitHub). */
export const ANIMATED_KINDS: readonly JobKind[] = [...JOB_KINDS, 'bitbucket', 'gitlab'];
export const ATLASSIAN_KINDS: readonly AtlassianKind[] = ['codesearch', 'confluence', 'jira', 'bitbucket'];
export const TRACKER_KINDS: readonly TrackerKind[] = ['linear'];
export const DOCS_KINDS: readonly DocsKind[] = ['gdocs'];
export const CODE_HOST_KINDS: readonly CodeHostKind[] = ['gitlab'];
export const COMMS_KINDS: readonly CommsKind[] = ['slack'];
export const WORKSPACE_KINDS: readonly WorkspaceKind[] = ['worktree'];
export const INCIDENT_KINDS: readonly IncidentKind[] = ['jsm', 'compass', 'statuspage'];
export const MONITOR_KINDS: readonly MonitorKind[] = ['datadog', 'grafana'];
export const PAGING_KINDS: readonly PagingKind[] = ['pagerduty'];
export const SERVICE_KINDS: readonly ServiceKind[] = ['server', 'web', 'api', 'db', 'cache', 'queue'];
export const SYSTEM_KINDS: readonly SystemKind[] = [
  ...JOB_KINDS,
  ...ATLASSIAN_KINDS,
  ...TRACKER_KINDS,
  ...DOCS_KINDS,
  ...CODE_HOST_KINDS,
  ...COMMS_KINDS,
  ...WORKSPACE_KINDS,
  ...INCIDENT_KINDS,
  ...MONITOR_KINDS,
  ...PAGING_KINDS,
  ...SERVICE_KINDS,
];
export function isService(kind: SystemKind): kind is ServiceKind {
  return (SERVICE_KINDS as readonly SystemKind[]).includes(kind);
}
/** Source code managers: code is checked in, merged and shipped from these. They share the branch emblem and job. */
export const SCM_KINDS = ['github', 'bitbucket', 'gitlab'] as const satisfies readonly SystemKind[];
export type ScmKind = (typeof SCM_KINDS)[number];
export function isScm(kind: SystemKind): kind is ScmKind {
  return (SCM_KINDS as readonly SystemKind[]).includes(kind);
}

/** Does this system have a job animation? */
export function hasJob(kind: SystemKind): kind is JobKind {
  return (ANIMATED_KINDS as readonly SystemKind[]).includes(kind);
}

export const SYSTEM_NAME: Record<SystemKind, string> = {
  figma: 'Figma',
  github: 'GitHub',
  notion: 'Notion',
  codesearch: 'Code search',
  confluence: 'Confluence',
  jira: 'Jira',
  bitbucket: 'Bitbucket',
  linear: 'Linear',
  gdocs: 'Google Docs',
  gitlab: 'GitLab',
  slack: 'Slack',
  worktree: 'Worktree',
  jsm: 'JSM',
  compass: 'Compass',
  statuspage: 'Statuspage',
  datadog: 'Datadog',
  grafana: 'Grafana',
  pagerduty: 'PagerDuty',
  server: 'Production server',
  web: 'Web',
  api: 'API',
  db: 'Database',
  cache: 'Cache',
  queue: 'Queue',
};

export interface EmblemMaterials {
  shell: Material;
  graphite: Material;
}

/**
 * A small low-poly emblem per system, in the scene's white + graphite. The
 * systems are told apart by shape, not brand color, so color stays reserved
 * for status and lineage. Each emblem is ~0.5 units tall, centered at its origin.
 */
export function buildEmblem(kind: SystemKind, m: EmblemMaterials): Group {
  const emblem = new Group();
  emblem.name = `emblem:${kind}`;
  const place = (o: Object3D, x: number, y: number, z = 0) => {
    o.position.set(x, y, z);
    emblem.add(o);
    return o;
  };

  if (kind === 'figma') {
    // Design: a column of rounded blocks beside a block and a sphere, in the spirit of Figma's mark.
    const block = new RoundedBoxGeometry(0.16, 0.16, 0.08, 2, 0.05);
    place(solid(block, m.shell), -0.085, 0.17);
    place(solid(block, m.shell), -0.085, 0);
    place(solid(block, m.graphite), -0.085, -0.17);
    place(solid(block, m.shell), 0.085, 0.17);
    place(solid(new SphereGeometry(0.08, 12, 8), m.graphite), 0.085, 0);
  } else if (isScm(kind)) {
    // Code (GitHub, Bitbucket, GitLab alike): a branch glyph. A trunk with two commits, and a fork curving off it.
    const commit = new SphereGeometry(0.06, 12, 8);
    place(solid(new CylinderGeometry(0.024, 0.024, 0.42, 8), m.graphite), -0.07, 0);
    place(solid(commit, m.shell), -0.07, 0.2);
    place(solid(commit, m.shell), -0.07, -0.2);
    const fork = new QuadraticBezierCurve3(new Vector3(-0.07, -0.08, 0), new Vector3(0.12, -0.04, 0), new Vector3(0.12, 0.14, 0));
    place(solid(new TubeGeometry(fork, 12, 0.022, 6), m.graphite), 0, 0);
    place(solid(commit, m.shell), 0.12, 0.17);
  } else if (kind === 'codesearch') {
    // Search: a magnifier over a couple of lines of code.
    const lens = new Group();
    lens.position.set(-0.03, 0.04, 0);
    lens.add(solid(new TorusGeometry(0.13, 0.03, 8, 24), m.graphite));
    const line = new BoxGeometry(0.12, 0.022, 0.012);
    lens.add(place(solid(line, m.shell), 0, 0.03), place(solid(new BoxGeometry(0.08, 0.022, 0.012), m.shell), -0.02, -0.03));
    emblem.add(lens);
    const handle = place(solid(new CylinderGeometry(0.028, 0.028, 0.16, 8), m.graphite), 0.11, -0.13);
    handle.rotation.z = Math.PI / 4;
  } else if (kind === 'confluence') {
    // Shared knowledge: an open book standing up, two ruled pages in a V around a spine.
    const page = new BoxGeometry(0.2, 0.3, 0.012);
    for (const side of [-1, 1]) {
      const leaf = new Group();
      leaf.rotation.y = -side * 0.55; // pages open toward the viewer
      const sheet = solid(page, m.shell);
      sheet.position.x = side * 0.1;
      leaf.add(sheet);
      for (let i = 0; i < 4; i++) {
        const rule = solid(new BoxGeometry(i === 3 ? 0.08 : 0.13, 0.016, 0.006), m.graphite);
        rule.position.set(side * 0.1 - (i === 3 ? side * 0.025 : 0), 0.09 - i * 0.06, 0.009);
        leaf.add(rule);
      }
      emblem.add(leaf);
    }
    place(solid(new CylinderGeometry(0.016, 0.016, 0.32, 6), m.graphite), 0, 0);
  } else if (kind === 'jira') {
    // Tracked work: a tiny kanban board, white cards in three columns on a dark board.
    const board = place(solid(new BoxGeometry(0.4, 0.3, 0.02), m.graphite), 0, 0, -0.02);
    board.rotation.x = 0;
    const card = new BoxGeometry(0.09, 0.05, 0.016);
    const columns = [3, 2, 1];
    columns.forEach((n, c) => {
      for (let r = 0; r < n; r++) place(solid(card, m.shell), -0.12 + c * 0.12, 0.09 - r * 0.075, 0.005);
    });
    for (let c = 0; c < 3; c++) place(solid(new BoxGeometry(0.1, 0.012, 0.012), m.shell), -0.12 + c * 0.12, 0.135, 0.005);
  } else if (kind === 'gdocs') {
    // A shared doc: one upright page with its top-right corner folded over, ruled with lines.
    const w = 0.3;
    const h = 0.38;
    const fold = 0.09;
    place(solid(new BoxGeometry(w - fold, h, 0.014), m.shell), -fold / 2, 0);
    place(solid(new BoxGeometry(fold, h - fold, 0.014), m.shell), w / 2 - fold / 2, -fold / 2);
    const corner = place(solid(new BoxGeometry(fold * 1.1, fold * 1.1, 0.016), m.graphite), w / 2 - fold / 2, h / 2 - fold / 2, 0.004);
    corner.rotation.z = Math.PI / 4;
    corner.scale.set(0.7, 0.7, 1);
    for (let i = 0; i < 4; i++) {
      place(solid(new BoxGeometry(i === 3 ? 0.12 : 0.2, 0.022, 0.012), m.graphite), i === 3 ? -0.04 : 0, 0.07 - i * 0.07, 0.012);
    }
  } else if (kind === 'worktree') {
    // A checkout of the repo: a folder, its tab up, with a small branch mark on it.
    place(solid(new RoundedBoxGeometry(0.42, 0.28, 0.08, 2, 0.03), m.shell), 0, -0.02);
    place(solid(new RoundedBoxGeometry(0.16, 0.07, 0.08, 2, 0.02), m.shell), -0.11, 0.14);
    // The branch mark: the code glyph's trunk, two commits and a fork curving off to a third, small, on the folder's face.
    const commit = new SphereGeometry(0.035, 10, 8);
    place(solid(new CylinderGeometry(0.018, 0.018, 0.16, 6), m.graphite), -0.04, -0.02, 0.045);
    place(solid(commit, m.graphite), -0.04, 0.07, 0.045);
    place(solid(commit, m.graphite), -0.04, -0.11, 0.045);
    const fork = new QuadraticBezierCurve3(new Vector3(-0.04, -0.06, 0.045), new Vector3(0.06, -0.04, 0.045), new Vector3(0.06, 0.03, 0.045));
    place(solid(new TubeGeometry(fork, 10, 0.016, 6), m.graphite), 0, 0);
    place(solid(commit, m.graphite), 0.06, 0.03, 0.045);
  } else if (kind === 'slack') {
    // Comms: a speech bubble with three lines of chat in it.
    place(solid(new RoundedBoxGeometry(0.42, 0.3, 0.06, 2, 0.06), m.shell), 0, 0.04);
    const tail = place(solid(new BoxGeometry(0.08, 0.08, 0.05), m.shell), -0.12, -0.12);
    tail.rotation.z = Math.PI / 4;
    for (let i = 0; i < 3; i++) place(solid(new BoxGeometry(i === 2 ? 0.16 : 0.28, 0.03, 0.012), m.graphite), i === 2 ? -0.06 : 0, 0.1 - i * 0.065, 0.034);
  } else if (kind === 'linear') {
    // Tracked work, third-party: a disc crossed by diagonal stripes, in the spirit of Linear's mark.
    const r = 0.21;
    const disc = place(solid(new CylinderGeometry(r, r, 0.06, 24), m.shell), 0, 0);
    disc.rotation.x = Math.PI / 2;
    // Stripes run corner to corner (top-left to bottom-right), each a chord of the disc.
    const stripes = new Group();
    stripes.rotation.z = -Math.PI / 4;
    stripes.position.z = 0.032;
    for (const d of [-0.11, 0, 0.11]) {
      const chord = 2 * Math.sqrt(r * r - d * d) - 0.03;
      const stripe = solid(new BoxGeometry(chord, 0.034, 0.012), m.graphite);
      stripe.position.y = d;
      stripes.add(stripe);
    }
    emblem.add(stripes);
  } else if (kind === 'jsm') {
    // The service desk: a concierge bell, a dome on a low base with a button on top.
    const dome = place(solid(new SphereGeometry(0.17, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), m.shell), 0, -0.08);
    dome.scale.y = 0.95;
    place(solid(new CylinderGeometry(0.22, 0.22, 0.04, 20), m.graphite), 0, -0.1);
    place(solid(new CylinderGeometry(0.016, 0.016, 0.08, 6), m.graphite), 0, 0.12);
    place(solid(new SphereGeometry(0.035, 10, 6), m.graphite), 0, 0.17);
  } else if (kind === 'compass') {
    // The service catalog: a compass, a ring around a needle (one half white, one graphite).
    const ring = place(solid(new TorusGeometry(0.18, 0.03, 8, 24), m.graphite), 0, 0);
    ring.rotation.x = 0;
    place(solid(new CylinderGeometry(0.16, 0.16, 0.02, 20), m.shell), 0, 0, -0.02).rotation.x = Math.PI / 2;
    for (const [up, mat] of [
      [1, m.graphite],
      [-1, m.shell],
    ] as const) {
      const half = place(solid(new CylinderGeometry(0, 0.045, 0.14, 4), mat), 0.0, up * 0.07, 0.02);
      half.rotation.z = up > 0 ? -0.5 : Math.PI - 0.5;
      half.position.set(up * 0.035, up * 0.06, 0.02);
    }
    place(solid(new SphereGeometry(0.025, 8, 6), m.shell), 0, 0, 0.03);
  } else if (kind === 'statuspage') {
    // The public status page: a card with a row of uptime bars under a heading.
    place(solid(new RoundedBoxGeometry(0.42, 0.3, 0.04, 2, 0.03), m.shell), 0, 0);
    place(solid(new BoxGeometry(0.2, 0.03, 0.012), m.graphite), -0.08, 0.09, 0.024);
    for (let i = 0; i < 7; i++) place(solid(new BoxGeometry(0.03, 0.1, 0.012), m.graphite), -0.15 + i * 0.05, -0.04, 0.024);
  } else if (kind === 'datadog') {
    // Monitoring: a line chart, a jagged line across a card.
    place(solid(new RoundedBoxGeometry(0.42, 0.3, 0.04, 2, 0.03), m.shell), 0, 0);
    const points = [
      [-0.16, -0.08],
      [-0.08, 0.02],
      [-0.02, -0.04],
      [0.06, 0.08],
      [0.16, -0.02],
    ];
    points.slice(1).forEach(([x, y], i) => {
      const [x0, y0] = points[i];
      const length = Math.hypot(x - x0, y - y0);
      const seg = place(solid(new BoxGeometry(length + 0.02, 0.026, 0.014), m.graphite), (x + x0) / 2, (y + y0) / 2, 0.026);
      seg.rotation.z = Math.atan2(y - y0, x - x0);
    });
  } else if (kind === 'grafana') {
    // Monitoring: a gauge, a half ring with a needle.
    const arc = place(solid(new TorusGeometry(0.17, 0.035, 8, 20, Math.PI), m.shell), 0, -0.07);
    arc.rotation.z = 0;
    place(solid(new CylinderGeometry(0.2, 0.2, 0.04, 20, 1, false, 0, Math.PI), m.graphite), 0, -0.07, -0.03).rotation.set(Math.PI / 2, 0, -Math.PI / 2);
    const needle = place(solid(new BoxGeometry(0.15, 0.024, 0.014), m.shell), 0.05, -0.02, 0.01);
    needle.rotation.z = 0.7;
    place(solid(new SphereGeometry(0.03, 8, 6), m.shell), 0, -0.07, 0.01);
  } else if (kind === 'pagerduty') {
    // Paging: a pager, a screen across its face and a button under it, a clip on its back.
    place(solid(new RoundedBoxGeometry(0.38, 0.28, 0.1, 2, 0.05), m.shell), 0, 0);
    place(solid(new BoxGeometry(0.26, 0.09, 0.012), m.graphite), -0.02, 0.04, 0.052);
    place(solid(new CylinderGeometry(0.03, 0.03, 0.02, 10), m.graphite), 0.12, -0.08, 0.052).rotation.x = Math.PI / 2;
    place(solid(new BoxGeometry(0.14, 0.04, 0.03), m.graphite), 0, 0.15, -0.03);
  } else if (kind === 'server') {
    // A production server: a rack of three units, each with a row of lights and a vent.
    for (let i = 0; i < 3; i++) {
      const y = -0.13 + i * 0.13;
      place(solid(new RoundedBoxGeometry(0.4, 0.11, 0.2, 2, 0.02), m.shell), 0, y);
      place(solid(new BoxGeometry(0.16, 0.025, 0.012), m.graphite), 0.08, y, 0.102);
      for (let k = 0; k < 2; k++) place(solid(new SphereGeometry(0.016, 8, 6), m.graphite), -0.14 + k * 0.05, y, 0.1);
    }
  } else if (kind === 'web') {
    // A web front: a browser window, its bar along the top, blocks of page below.
    place(solid(new RoundedBoxGeometry(0.44, 0.32, 0.04, 2, 0.03), m.shell), 0, 0);
    place(solid(new BoxGeometry(0.44, 0.06, 0.046), m.graphite), 0, 0.13);
    place(solid(new BoxGeometry(0.16, 0.14, 0.012), m.graphite), -0.1, -0.04, 0.024);
    place(solid(new BoxGeometry(0.14, 0.03, 0.012), m.graphite), 0.1, 0.0, 0.024);
    place(solid(new BoxGeometry(0.14, 0.03, 0.012), m.graphite), 0.1, -0.07, 0.024);
  } else if (kind === 'api') {
    // An API: a pair of braces around a dot.
    for (const side of [-1, 1]) {
      // One brace, drawn as a thick outline: top arm, upper stem, the point, lower stem, bottom arm.
      const w = 0.035;
      const x0 = side * 0.12;
      // Arms reach in toward the dot; the point juts out.
      const pts: [number, number][] = [
        [x0 - side * 0.06, 0.17],
        [x0, 0.17],
        [x0, 0.04],
        [x0 + side * 0.05, 0],
        [x0, -0.04],
        [x0, -0.17],
        [x0 - side * 0.06, -0.17],
      ];
      pts.slice(1).forEach(([x, y], i) => {
        const [px, py] = pts[i];
        const length = Math.hypot(x - px, y - py);
        const seg = place(solid(new BoxGeometry(length + w * 0.8, w, 0.05), m.graphite), (x + px) / 2, (y + py) / 2);
        seg.rotation.z = Math.atan2(y - py, x - px);
      });
    }
    place(solid(new SphereGeometry(0.045, 10, 8), m.shell), 0, 0);
  } else if (kind === 'db') {
    // A database: three stacked discs, graphite seams between them.
    for (let i = 0; i < 3; i++) place(solid(new CylinderGeometry(0.17, 0.17, 0.1, 20), m.shell), 0, -0.12 + i * 0.12);
    for (let i = 0; i < 2; i++) place(solid(new CylinderGeometry(0.175, 0.175, 0.02, 20), m.graphite), 0, -0.06 + i * 0.12);
  } else if (kind === 'cache') {
    // A cache: a bolt, for fast.
    const bolt = new Shape();
    bolt.moveTo(0.04, 0.2);
    bolt.lineTo(-0.12, -0.02);
    bolt.lineTo(-0.01, -0.02);
    bolt.lineTo(-0.05, -0.2);
    bolt.lineTo(0.12, 0.04);
    bolt.lineTo(0.01, 0.04);
    bolt.closePath();
    const geometry = new ExtrudeGeometry(bolt, { depth: 0.06, bevelEnabled: false });
    geometry.translate(0, 0, -0.03);
    place(solid(geometry, m.shell), 0, 0);
  } else if (kind === 'queue') {
    // A queue: three messages in a row on a rail, waiting their turn.
    place(solid(new BoxGeometry(0.46, 0.03, 0.08), m.graphite), 0, -0.08);
    for (let i = 0; i < 3; i++) place(solid(new RoundedBoxGeometry(0.11, 0.11, 0.11, 2, 0.02), m.shell), -0.14 + i * 0.14, 0.0);
  } else {
    // Docs: a small stack of ruled pages, the same pages the Notion job stacks up.
    const stack = new Group();
    stack.rotation.x = 0.95; // tipped toward the viewer so the top page reads
    emblem.add(stack);
    const page = new BoxGeometry(0.34, 0.014, 0.42);
    [0, 1, 2].forEach((i) => {
      const sheet = solid(page, m.shell);
      sheet.position.y = -0.03 + i * 0.026;
      sheet.rotation.y = (i - 1) * 0.07;
      stack.add(sheet);
    });
    const line = new BoxGeometry(0.22, 0.006, 0.026);
    for (let i = 0; i < 4; i++) {
      const rule = solid(line, m.graphite);
      rule.scale.x = i === 3 ? 0.6 : 1;
      rule.position.set(i === 3 ? -0.044 : 0, 0.03, -0.12 + i * 0.08);
      stack.add(rule);
    }
  }
  return emblem;
}

