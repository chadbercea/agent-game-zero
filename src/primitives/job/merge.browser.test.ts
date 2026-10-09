import { Mesh, TubeGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import { isScm, SCM_KINDS, SYSTEM_NAME } from '../node/emblems';
import { Job } from './Job';
import { RepoTrunk, TRUNK_SHOWN } from './RepoTrunk';

describe('Source code managers: branch, squash merge, trunk', () => {
  it('GitHub, Bitbucket and GitLab are the SCMs, and all run the branch job', () => {
    expect([...SCM_KINDS]).toEqual(['github', 'bitbucket', 'gitlab']);
    expect(SYSTEM_NAME.gitlab).toBe('GitLab');
    expect(isScm('confluence')).toBe(false);
    for (const kind of SCM_KINDS) expect(new Job(kind).name).toBe(`job:${kind}`);
  });

  it('the merge ending folds the fork back in: merged only at the end, the branch gone', () => {
    const job = new Job('gitlab', { ending: 'merge' });
    job.progress = 0.5;
    expect(job.merged).toBe(false);
    const forkShown = () => job.children[0].children.some((c) => c instanceof Mesh && c.visible && c.geometry instanceof TubeGeometry);
    expect(forkShown()).toBe(true);
    job.progress = 1;
    expect(job.merged).toBe(true);
    expect(forkShown()).toBe(false);
    // The default ending is unchanged.
    const init = new Job('github');
    init.progress = 1;
    expect(init.merged).toBe(false);
  });

  it('the trunk gains one commit per merge, and keeps only the newest on view', () => {
    const trunk = new RepoTrunk();
    for (let i = 0; i < 3; i++) trunk.commit();
    for (let i = 0; i < 60; i++) trunk.update(1 / 30);
    expect(trunk.count).toBe(3);
    expect(trunk.shown).toBe(3);
    for (let i = 0; i < 6; i++) trunk.commit();
    for (let i = 0; i < 90; i++) trunk.update(1 / 30);
    expect(trunk.count).toBe(9);
    expect(trunk.shown).toBe(TRUNK_SHOWN);
  });
});
