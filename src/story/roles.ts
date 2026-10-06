import { seededRandom } from '../core/scatter';

/** What a sub-agent does once the system is connected. */
export type Role = 'stay' | 'despawn' | 'travel';

/** How likely each role is for sub-agents beyond the first three (which cover one of each). */
const ODDS: readonly [Role, number][] = [
  ['stay', 0.4],
  ['travel', 0.35],
  ['despawn', 0.25],
];

/**
 * Give each sub-agent a role for this run, from the seed: some stay working
 * at their node, some finish and go home, some travel to another system.
 * Only sub-agents with somewhere to travel (`canTravel`) may travel. Every
 * run has at least one of each role whenever there are enough sub-agents
 * (and someone who can travel).
 */
export function assignRoles(canTravel: readonly boolean[], seed: number): Role[] {
  const random = seededRandom(seed);
  const order = canTravel.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const roles = new Array<Role | undefined>(canTravel.length);
  const take = (role: Role, eligible: (i: number) => boolean) => {
    const i = order.find((k) => roles[k] === undefined && eligible(k));
    if (i !== undefined) roles[i] = role;
  };
  take('travel', (i) => canTravel[i]);
  take('despawn', () => true);
  take('stay', () => true);
  for (const i of order) {
    if (roles[i] !== undefined) continue;
    let draw = random();
    let role: Role = 'stay';
    for (const [r, odds] of ODDS) {
      if (r === 'travel' && !canTravel[i]) continue;
      if ((draw -= odds) < 0) {
        role = r;
        break;
      }
    }
    roles[i] = role;
  }
  return roles as Role[];
}
