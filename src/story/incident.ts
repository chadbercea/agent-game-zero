import { seededRandom } from '../core/scatter';
import type { ServiceKind } from '../primitives/node/emblems';

/**
 * What the seed decides in Rovo on Call (docs/rovo-mental-model.md): the
 * production map past the portal and the incident on it. Plain data, rolled
 * once from the seed, so the same seed is always the same incident.
 *
 * | Roll | Outcomes and weights |
 * |---|---|
 * | Production | a web front; 2–3 APIs behind it; 2–3 data stores behind those (5–7 services) |
 * | What broke | bad deploy 40% · dependency down 25% · traffic spike 20% · bad config 15% |
 * | Mitigation | bad deploy: rollback 70% or hotfix 30% · dependency: failover · spike: scale out 1–3 replicas · config: flag off |
 * | Severity | SEV3 45% · SEV2 35% · SEV1 20% (crew 1–3 triage copies; Statuspage at SEV1–2; the human paged at SEV1, half of SEV2) |
 * | Blast radius | everything that depends on the failing service, along the lines |
 * | Detours | wrong first lead 30% · flaky CI on a hotfix 20% |
 * | Follow-ups | 1–4 cards left in To do, more at higher severity |
 */
export interface Incident {
  services: Service[];
  cause: Cause;
  /** The failing service (an index into `services`). */
  culprit: number;
  /** Everything that depends on the culprit, directly or not: these go yellow. */
  degraded: number[];
  mitigation: Mitigation;
  /** Replicas that grow in beside the culprit (scale out: 1–3; failover: the standby). */
  replicas: number;
  sev: 1 | 2 | 3;
  /** The triage copies' leads, one per copy (1–3); `find` is the one that finds it. */
  leads: Lead[];
  find: Lead;
  /** A human is paged on the user's terminal. */
  paged: boolean;
  /** The copy that finds it first reads a runbook that doesn't apply, then turns to Code search. */
  wrongLead: boolean;
  /** CI tails red once on the hotfix, then passes on the retry. */
  flakyCI: boolean;
  /** Follow-up cards left in To do at the end. */
  followUps: number;
}

export interface Service {
  name: string;
  kind: ServiceKind;
  /** 0: the front; 1: APIs; 2: data. */
  tier: 0 | 1 | 2;
  /** Which slot of its tier it stands in (storyMap's ProductionPlace). */
  slot: number;
  /** The services it calls (indexes into `services`). */
  calls: number[];
}

export type Cause = 'deploy' | 'dependency' | 'spike' | 'config';
export type Mitigation = 'rollback' | 'hotfix' | 'failover' | 'scale-out' | 'flag-off';
/** Where a triage copy looks: the runbook (Confluence), the dependencies (Compass), recent deploys (Bitbucket), or the service's logs. */
export type Lead = 'runbook' | 'dependencies' | 'deploys' | 'logs';

const LEADS: readonly Lead[] = ['runbook', 'dependencies', 'deploys', 'logs'];
/** The lead that finds each cause. */
export const FINDS: Record<Cause, Lead> = { deploy: 'deploys', dependency: 'dependencies', spike: 'logs', config: 'runbook' };

const WEB = ['storefront', 'web-app'];
const APIS = ['checkout-api', 'search-api', 'auth', 'payments', 'cart-api'];
const DATA: [ServiceKind, string][] = [
  ['db', 'orders-db'],
  ['db', 'catalog-db'],
  ['cache', 'session-cache'],
  ['queue', 'events-queue'],
];

export function rollIncident(seed: number): Incident {
  const random = seededRandom(seed * 104729 + 3);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
  const weighted = <T>(options: [T, number][]): T => {
    let r = random() * options.reduce((sum, [, w]) => sum + w, 0);
    for (const [value, w] of options) {
      r -= w;
      if (r <= 0) return value;
    }
    return options[options.length - 1][0];
  };
  const shuffled = <T>(items: readonly T[]): T[] => {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };

  // Production: a web front, 2–3 APIs, 2–3 data stores, each tier in its own slots.
  const apiCount = 2 + Math.floor(random() * 2);
  const dataCount = 2 + Math.floor(random() * 2);
  const slots = (n: number) => (n === 3 ? [0, 1, 2] : shuffled([0, 1, 2]).slice(0, n).sort());
  const services: Service[] = [{ name: pick(WEB), kind: 'web', tier: 0, slot: 0, calls: [] }];
  const apiNames = shuffled(APIS);
  for (const slot of slots(apiCount)) services.push({ name: apiNames.pop()!, kind: 'api', tier: 1, slot, calls: [] });
  const data = shuffled(DATA);
  for (const slot of slots(dataCount)) {
    const [kind, name] = data.pop()!;
    services.push({ name, kind, tier: 2, slot, calls: [] });
  }
  const apis = services.flatMap((s, i) => (s.tier === 1 ? [i] : []));
  const stores = services.flatMap((s, i) => (s.tier === 2 ? [i] : []));
  // The front calls every API. Each API calls the store in line with it (or the nearest), sometimes one more; every store is called.
  services[0].calls = [...apis];
  for (const a of apis) {
    const near = [...stores].sort((p, q) => Math.abs(services[p].slot - services[a].slot) - Math.abs(services[q].slot - services[a].slot));
    services[a].calls = random() < 0.35 && near.length > 1 ? [near[0], near[1]] : [near[0]];
  }
  for (const s of stores) {
    if (apis.some((a) => services[a].calls.includes(s))) continue;
    const nearest = [...apis].sort((p, q) => Math.abs(services[p].slot - services[s].slot) - Math.abs(services[q].slot - services[s].slot))[0];
    services[nearest].calls.push(s);
  }

  const cause = weighted<Cause>([
    ['deploy', 40],
    ['dependency', 25],
    ['spike', 20],
    ['config', 15],
  ]);
  const culprit = pick(cause === 'dependency' ? stores : cause === 'config' ? apis : [0, ...apis]);
  // Upstream: everything that calls the culprit, and everything that calls those.
  const degraded: number[] = [];
  const reach = (i: number) => {
    services.forEach((s, j) => {
      if (s.calls.includes(i) && !degraded.includes(j)) {
        degraded.push(j);
        reach(j);
      }
    });
  };
  reach(culprit);

  const mitigation: Mitigation =
    cause === 'deploy'
      ? weighted<Mitigation>([
          ['rollback', 70],
          ['hotfix', 30],
        ])
      : cause === 'dependency'
        ? 'failover'
        : cause === 'spike'
          ? 'scale-out'
          : 'flag-off';
  const replicas = mitigation === 'scale-out' ? 1 + Math.floor(random() * 3) : mitigation === 'failover' ? 1 : 0;
  const sev = weighted<1 | 2 | 3>([
    [3, 45],
    [2, 35],
    [1, 20],
  ]);
  // Crew by severity: one copy at SEV3, up to three at SEV1. The lead that finds it is always among them.
  const find = FINDS[cause];
  const leads = [find, ...shuffled(LEADS.filter((l) => l !== find))].slice(0, 4 - sev);
  const paged = sev === 1 || (sev === 2 && random() < 0.5);
  const wrongLead = random() < 0.3;
  const flakyCI = random() < 0.2 && mitigation === 'hotfix';
  const followUps = Math.min(4, 1 + Math.floor(random() * (5 - sev)));
  return { services, cause, culprit, degraded, mitigation, replicas, sev, leads: shuffled(leads), find, paged, wrongLead, flakyCI, followUps };
}
