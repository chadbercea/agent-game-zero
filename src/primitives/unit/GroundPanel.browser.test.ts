import { Group } from 'three';
import { describe, expect, it } from 'vitest';
import { SystemNode } from '../node/SystemNode';
import { GroundPanel, type GroundPanelData } from './GroundPanel';
import { GROUND_CLAIM, type GroundClaim } from './groundClaims';
import { unitLayout } from './unitLayout';

const facts = (node: SystemNode): GroundPanelData => ({ name: 'Jira', system: 'Teamwork Graph', light: node.light, makes: 'Work items', linked: [] });

function setUp(fullScale: number) {
  const scene = new Group();
  const node = new SystemNode({ kind: 'jira', showLabel: false });
  node.position.set(2, 0, -1);
  node.scale.setScalar(fullScale);
  const ground = new GroundPanel(node, { direction: 'x', fullScale, data: () => facts(node) });
  scene.add(node);
  scene.updateMatrixWorld(true);
  const claim = () => (ground.userData[GROUND_CLAIM] as GroundClaim)();
  return { scene, node, ground, claim };
}

describe('GroundPanel', () => {
  it('stays true size on a node that stands bigger, wrapping the node as it stands', () => {
    const { ground, claim } = setUp(1.35);
    const border = unitLayout('x', 1.35).border;
    const rect = claim();
    expect(rect?.minX).toBeCloseTo(2 + border.minX);
    expect(rect?.maxX).toBeCloseTo(2 + border.maxX);
    expect(rect?.minZ).toBeCloseTo(-1 + border.minZ);
    expect(ground.footprint.maxZ).toBeCloseTo(-1 + border.maxZ);
  });

  it('folds with its node, and claims no floor once folded', () => {
    const { scene, node, claim } = setUp(1);
    node.scale.setScalar(0.5);
    scene.updateMatrixWorld(true);
    const half = claim();
    const full = unitLayout('x').border;
    expect(half && half.maxX - half.minX).toBeCloseTo((full.maxX - full.minX) / 2);
    node.scale.setScalar(0.001);
    scene.updateMatrixWorld(true);
    expect(claim()).toBeNull();
  });

  it('repaints when what it shows changes, and only then: a change in activity repaints just the facts', () => {
    const { node, ground } = setUp(1);
    type Layer = { shown: string; texture: { version: number } };
    const { base, facts } = ground as unknown as { base: Layer; facts: Layer };
    const [baseVersion, factsVersion] = [base.texture.version, facts.texture.version];
    ground.refresh();
    expect([base.texture.version, facts.texture.version]).toEqual([baseVersion, factsVersion]);
    node.light = 'working';
    ground.refresh();
    expect(facts.texture.version).toBe(factsVersion + 1);
    expect(facts.shown).toContain('Working now');
    expect(base.texture.version).toBe(baseVersion);
  });

  it('goes with its node', () => {
    const { node, ground } = setUp(1);
    node.dispose();
    expect(ground.parent).toBeNull();
  });
});
