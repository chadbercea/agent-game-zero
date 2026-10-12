import { Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import type { SceneHost } from '../stage/Stage';
import type { Mitigation } from './incident';
import { ON_CALL_BEATS, type OnCallBeat, RovoOnCall } from './rovoOnCall';

function testStage(fps = 30) {
  const DT = 1 / fps;
  const root = new Object3D();
  const ticks = new Set<(dt: number) => void>();
  const stage = {
    add: (...objects: Object3D[]) => root.add(...objects),
    onTick: (fn: (dt: number) => void) => {
      ticks.add(fn);
      return () => void ticks.delete(fn);
    },
  } as unknown as SceneHost;
  const run = async (seconds: number, each: () => boolean | void = () => {}) => {
    for (let t = 0; t < seconds; t += DT) {
      for (const fn of [...ticks]) fn(DT);
      if (each()) return;
      for (let i = 0; i < 6; i++) await Promise.resolve();
    }
  };
  return { root, stage, run };
}

/** Run one incident to its end, noting the beats and what was on the grid along the way. */
async function runIncident(seed: number) {
  const { stage, run } = testStage();
  const scene = new RovoOnCall(stage, seed);
  const beats: OnCallBeat[] = [];
  const seen = { statuspage: false, datadog: false, pagerduty: false, mostCopies: 0, red: false, mostReplicas: 0, lanes: 0 };
  void scene.start();
  await run(600, () => {
    if (beats[beats.length - 1] !== scene.beat) beats.push(scene.beat);
    seen.statuspage ||= scene.systems.placed.has('statuspage');
    seen.datadog ||= scene.systems.placed.has('datadog');
    seen.pagerduty ||= scene.systems.placed.has('pagerduty');
    seen.mostCopies = Math.max(seen.mostCopies, scene.copies.size);
    seen.red ||= scene.production.nodes[scene.incident.culprit].light === 'stopped';
    seen.mostReplicas = Math.max(seen.mostReplicas, scene.production.replicas.length);
    seen.lanes = Math.max(seen.lanes, scene.lanes.filter(Boolean).length);
    return scene.finished;
  });
  return { scene, beats, seen };
}

/** Seeds that cover every fix (rollIncident): 2 rolls back, 1 hotfixes, 14 fails over, 13 scales out, 3 turns a flag off. */
const BY_FIX: [Mitigation, number][] = [
  ['rollback', 2],
  ['hotfix', 1],
  ['failover', 14],
  ['scale-out', 13],
  ['flag-off', 3],
];

describe('Rovo on Call', () => {
  for (const [fix, seed] of BY_FIX) {
    it(`seed ${seed}: page to postmortem, fixed by ${fix}`, async () => {
      const { scene, beats, seen } = await runIncident(seed);
      const { incident, production } = scene;
      expect(incident.mitigation).toBe(fix);
      expect(scene.finished).toBe(true);
      expect(beats).toEqual([...ON_CALL_BEATS]);
      // The failing service went red; at the end everything in service is green again.
      expect(seen.red).toBe(true);
      production.nodes.forEach((node, i) => expect(node.light).toBe(fix === 'failover' && i === incident.culprit ? 'off' : 'working'));
      // JSM stays (Teamwork Graph); Datadog and PagerDuty came for the alert and went when it was resolved; Statuspage only at SEV1–2, and gone after.
      expect(scene.systems.placed.get('jsm')?.permanent).toBe(true);
      expect([seen.datadog, seen.pagerduty]).toEqual([true, true]);
      expect(scene.systems.placed.has('datadog') || scene.systems.placed.has('pagerduty')).toBe(false);
      expect(seen.statuspage).toBe(incident.sev <= 2);
      expect(scene.systems.placed.has('statuspage')).toBe(false);
      expect(scene.statusUpdates).toBe(incident.sev <= 2 ? 3 : 0);
      // The fix, by its kind.
      if (fix === 'rollback' || fix === 'hotfix') expect([scene.shipped, production.delivered]).toEqual([1, 1]);
      else expect(scene.shipped).toBe(0);
      expect(seen.lanes).toBe(fix === 'hotfix' ? 1 : 0);
      // Scale out grows as many replicas as the dice say, where there's room beside the service (two, at most, beside a middle API).
      if (fix === 'scale-out') expect(seen.mostReplicas).toBeGreaterThanOrEqual(Math.min(2, incident.replicas));
      expect(production.replicas).toHaveLength(fix === 'failover' ? 1 : 0);
      expect(Boolean(production.flag)).toBe(fix === 'flag-off');
      // PagerDuty alerted people where they are: Slack and the phone, at the page and again at resolve; the person acked on the phone.
      expect(scene.pages).toBe(4);
      expect(scene.acks).toBe(1);
      expect(scene.phone.visible).toBe(true);
      // Comms: Slack ran all along.
      expect(scene.commsMessages).toBeGreaterThanOrEqual(4);
      expect(scene.userReports).toBe(0);
      // The postmortem stayed in Confluence; the incident card went to Done; follow-ups wait in To do.
      expect(scene.systems.placed.get('confluence')?.writeBacks.length).toBeGreaterThanOrEqual(1);
      expect(scene.hub.board).toHaveLength(incident.followUps);
      // Crew: the triage copies and the comms copy at once, then everyone home.
      expect(seen.mostCopies).toBe(incident.leads.length + 1);
      expect(scene.copies.size).toBe(0);
    });
  }

  it('a flaky CI run on a hotfix tails red once, then passes on the retry', async () => {
    const { scene } = await runIncident(42);
    expect(scene.incident.flakyCI).toBe(true);
    expect(scene.finished).toBe(true);
    expect(scene.ciRetries).toBe(1);
    expect(scene.shipped).toBe(1);
  });
});
