import type { ScmKind, SystemKind } from '../primitives/node/emblems';

/**
 * What a Jira task asks a copy of Rovo to do (docs/rovo-mental-model.md).
 * Each type is a short loop of steps across systems; a copy runs one task,
 * one step at a time.
 */
export type TaskType = 'code' | 'doc' | 'read' | 'jira' | 'slack' | 'spec';
export const TASK_TYPES: readonly TaskType[] = ['code', 'doc', 'read', 'jira', 'slack', 'spec'];

/** A Jira issue's title for each kind of task. */
export const TASK_TITLE: Record<TaskType, string> = {
  code: 'Ship a code change',
  doc: 'Write the doc',
  read: 'Research the context',
  jira: 'Update the issue',
  slack: 'Post the update',
  spec: 'Write the spec from Figma',
};

/** What a copy does at a system: reads from it, writes to it, updates it, sends through it, or changes code in it. */
export type StepAction = 'read' | 'write' | 'update' | 'send' | 'code';

export interface Step {
  system: SystemKind;
  action: StepAction;
  /** Read through an MCP server (Figma): the copy also works a terminal beside the system, the MCP client. */
  mcp?: boolean;
}

export interface Task {
  type: TaskType;
  steps: Step[];
  /** After the last step, the copy updates the user's terminal (the spec loop). */
  reportToUser?: boolean;
}

/** Atlassian Teamwork Graph apps: permanent on the grid once first called. */
export const TWG_SYSTEMS: readonly SystemKind[] = ['jira', 'confluence', 'codesearch', 'bitbucket'];
/** Docs a copy can write to or read from: Confluence (TWG) or third-party docs (on call). */
export const DOC_SYSTEMS: readonly SystemKind[] = ['confluence', 'gdocs', 'notion'];
/** How often each is written to: Confluence carries most of it; Notion is rare. */
export const DOC_WEIGHTS: Partial<Record<SystemKind, number>> = { confluence: 0.68, gdocs: 0.24, notion: 0.08 };
/** Places a copy can read from. */
export const READ_SYSTEMS: readonly SystemKind[] = ['confluence', 'figma', 'bitbucket', 'codesearch', 'gdocs', 'notion'];
/** How often each is read: Confluence most, then Figma (designs, often through MCP), the repo; Notion is rare. */
export const READ_WEIGHTS: Partial<Record<SystemKind, number>> = { confluence: 0.34, figma: 0.24, bitbucket: 0.14, codesearch: 0.1, gdocs: 0.12, notion: 0.06 };
/** How often a Figma read goes through MCP (a terminal beside Figma). */
export const MCP_SHARE = 0.5;

/** Is this a Teamwork Graph app (permanent), or a third-party tool (spawned on call, gone when its issue is done)? */
export function isTwg(kind: SystemKind): boolean {
  return TWG_SYSTEMS.includes(kind);
}

/**
 * How often each task type comes up: biased toward the simple ones (one or
 * two steps), with code the most common and the long spec loop rare.
 */
export const TASK_WEIGHTS: Record<TaskType, number> = { code: 0.32, doc: 0.16, read: 0.2, jira: 0.1, spec: 0.12, slack: 0.1 };

export interface TaskOptions {
  /** The run's source code manager: every code task in a run goes to the same repo. */
  scm: ScmKind;
  /** Leave out task types the scene can't show yet. */
  without?: readonly TaskType[];
}

/** A seeded Jira task: a type by TASK_WEIGHTS, then its steps (short, varied). */
export function makeTask(random: () => number, options: TaskOptions): Task {
  const type = pickWeighted(random, options.without ?? []);
  const weighted = (weights: Partial<Record<SystemKind, number>>): SystemKind => {
    const kinds = Object.keys(weights) as SystemKind[];
    let r = random() * kinds.reduce((sum, k) => sum + (weights[k] ?? 0), 0);
    for (const k of kinds) {
      r -= weights[k] ?? 0;
      if (r <= 0) return k;
    }
    return kinds[kinds.length - 1];
  };
  const read = (): Step => {
    const system = weighted(READ_WEIGHTS);
    return system === 'figma' && random() < MCP_SHARE ? { system, action: 'read', mcp: true } : { system, action: 'read' };
  };
  switch (type) {
    case 'code':
      return { type, steps: [{ system: options.scm, action: 'code' }] };
    case 'doc': {
      // Mostly just write it; sometimes read something first.
      const write: Step = { system: weighted(DOC_WEIGHTS), action: 'write' };
      return random() < 0.6 ? { type, steps: [write] } : { type, steps: [read(), write] };
    }
    case 'read':
      return { type, steps: [read()] };
    case 'jira':
      return { type, steps: [{ system: 'jira', action: 'update' }] };
    case 'slack':
      return { type, steps: [{ system: 'slack', action: 'send' }] };
    case 'spec':
      // Chad's loop: read Confluence → read Figma (MCP) → update Confluence → update the terminal back to the user.
      return {
        type,
        reportToUser: true,
        steps: [
          { system: 'confluence', action: 'read' },
          { system: 'figma', action: 'read', mcp: true },
          { system: 'confluence', action: 'update' },
        ],
      };
  }
}

function pickWeighted(random: () => number, without: readonly TaskType[]): TaskType {
  const types = TASK_TYPES.filter((t) => !without.includes(t));
  const total = types.reduce((sum, t) => sum + TASK_WEIGHTS[t], 0);
  let r = random() * total;
  for (const t of types) {
    r -= TASK_WEIGHTS[t];
    if (r <= 0) return t;
  }
  return types[types.length - 1];
}
