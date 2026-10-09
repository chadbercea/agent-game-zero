import { describe, expect, it } from 'vitest';
import { seededRandom } from '../core/scatter';
import { isTwg, makeTask, TASK_TYPES } from './rovoTasks';

describe('Rovo tasks', () => {
  const many = (seed: number, n = 400) => {
    const random = seededRandom(seed);
    return Array.from({ length: n }, () => makeTask(random, { scm: 'gitlab' }));
  };

  it('the same seed gives the same tasks', () => {
    expect(JSON.stringify(many(7, 50))).toBe(JSON.stringify(many(7, 50)));
    expect(JSON.stringify(many(7, 50))).not.toBe(JSON.stringify(many(8, 50)));
  });

  it('biased simple but varied: mostly one or two steps, every type turns up', () => {
    const tasks = many(3);
    const short = tasks.filter((t) => t.steps.length <= 2).length;
    expect(short / tasks.length).toBeGreaterThan(0.85);
    for (const type of TASK_TYPES) expect(tasks.some((t) => t.type === type)).toBe(true);
  });

  it('code goes to the run\'s SCM; spec is Chad\'s loop; types can be left out', () => {
    const tasks = many(5);
    for (const t of tasks.filter((t) => t.type === 'code')) expect(t.steps).toEqual([{ system: 'gitlab', action: 'code' }]);
    const spec = tasks.find((t) => t.type === 'spec');
    expect(spec?.steps.map((s) => `${s.action} ${s.system}`)).toEqual(['read confluence', 'read figma', 'update confluence']);
    expect(spec?.reportToUser).toBe(true);
    const random = seededRandom(1);
    for (let i = 0; i < 200; i++) expect(makeTask(random, { scm: 'github', without: ['slack'] }).type).not.toBe('slack');
  });

  it('Confluence carries the most work, Figma comes up often (often through MCP), Notion rarely', () => {
    const steps = many(9, 1000).flatMap((t) => t.steps).filter((st) => st.action !== 'code');
    const count = (kind: string) => steps.filter((st) => st.system === kind).length;
    const others = ['figma', 'gdocs', 'notion', 'codesearch', 'bitbucket', 'jira', 'slack'];
    for (const kind of others) expect(count('confluence')).toBeGreaterThan(count(kind));
    expect(count('figma')).toBeGreaterThan(count('notion') * 3);
    expect(count('notion') / steps.length).toBeLessThan(0.05);
    expect(steps.some((st) => st.system === 'figma' && st.mcp)).toBe(true);
    expect(steps.some((st) => st.system === 'figma' && !st.mcp)).toBe(true);
  });

  it('Teamwork Graph apps are permanent; third-party tools are not', () => {
    for (const kind of ['jira', 'confluence', 'bitbucket', 'codesearch'] as const) expect(isTwg(kind)).toBe(true);
    for (const kind of ['github', 'gitlab', 'gdocs', 'notion', 'figma', 'slack'] as const) expect(isTwg(kind)).toBe(false);
  });
});
