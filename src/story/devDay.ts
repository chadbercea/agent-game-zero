import { seededRandom } from '../core/scatter';
import { pickCloudShape } from '../primitives/cloud/Cloud';
import type { Step } from './rovoTasks';

/**
 * What the seed decides in Rovo Dev (docs/rovo-mental-model.md): the
 * developer's issues for the day and how each one goes. Plain data, rolled
 * once from the seed, so the same seed is always the same day.
 *
 * | Roll | Outcomes and weights |
 * |---|---|
 * | Issues | 2 (55%) or 3 (45%), each dropped onto Jira by its own group of clouds |
 * | Each issue | the first is always a user-facing bug (the one Slack tells the developer about); the rest bug 50% · feature 30% · chore 20% |
 * | Understand | bug: Code search · feature: Confluence, then Figma through MCP 50% · chore: the repo (Bitbucket) |
 * | Review | changes requested 30% per issue: the coder writes again, checks in again, and it's reviewed again |
 * | CI | red once, then passes on the retry: 35% (the first change to reach CI) |
 * | Wrap-up | the release notes in Confluence, back to the developer, and the fix posted in Slack, where it started: always |
 * | Clouds | 1–3 in each group, each a seeded shape; each group's path a little up or down the screen |
 */
export interface DevDay {
  issues: DevIssue[];
  /** CI tails red once on the first change to reach it, then passes on the retry. */
  flakyCI: boolean;
}

export interface DevIssue {
  kind: IssueKind;
  /** The issue's title, as the team filed it. */
  title: string;
  /** What the copy reads to understand it, before it reports back to the developer. */
  understand: Step[];
  /** The review asks for changes once. */
  changes: boolean;
  /** The clouds that bring it: each one's shape (the first drops the card). */
  clouds: number[];
  /** Its clouds' path off straight screen-right, in radians. */
  tilt: number;
}

export type IssueKind = 'bug' | 'feature' | 'chore';

const TITLES: Record<IssueKind, readonly string[]> = {
  bug: ['Login times out on SSO', 'Search shows stale results', 'Export drops the last row', 'Avatar upload fails'],
  feature: ['Add dark mode', 'Bulk edit issues', 'Import from CSV', 'Keyboard shortcuts'],
  chore: ['Add the missing tests', 'Upgrade the build', 'Remove dead flags', 'Speed up the CI suite'],
};

/** The verb on each issue's code ticket. */
export const CODE_TITLE: Record<IssueKind, (title: string) => string> = {
  bug: (t) => `Fix: ${t}`,
  feature: (t) => `Build: ${t}`,
  chore: (t) => `Do: ${t}`,
};

export function rollDevDay(seed: number): DevDay {
  const random = seededRandom(seed * 17 + 3);
  const count = random() < 0.55 ? 2 : 3;
  const used = new Set<string>();
  const issues = Array.from({ length: count }, (_, i): DevIssue => {
    const r = random();
    // The first is the user-facing bug the developer hears about in Slack.
    const kind: IssueKind = i === 0 || r < 0.5 ? 'bug' : r < 0.8 ? 'feature' : 'chore';
    const pool = TITLES[kind].filter((t) => !used.has(t));
    const title = pool[Math.floor(random() * pool.length)];
    used.add(title);
    const understand: Step[] =
      kind === 'bug'
        ? [{ system: 'codesearch', action: 'read' }]
        : kind === 'feature'
          ? [{ system: 'confluence', action: 'read' }, ...(random() < 0.5 ? [{ system: 'figma', action: 'read', mcp: true } as Step] : [])]
          : [{ system: 'bitbucket', action: 'read' }];
    const changes = random() < 0.3;
    const clouds = Array.from({ length: 1 + Math.floor(random() * 3) }, () => pickCloudShape(random));
    const tilt = (random() - 0.5) * 0.4;
    return { kind, title, understand, changes, clouds, tilt };
  });
  return { issues, flakyCI: random() < 0.35 };
}
