import type { Vector3 } from 'three';
import { DroneFlight } from '../animation/DroneFlight';
import type { Ticket } from '../primitives/ticket/Ticket';
import { attachSignal } from '../stage/attachSignal';
import type { SceneHost } from '../stage/Stage';
import { type Incident, type Lead, type Mitigation, rollIncident } from './incident';
import { Production } from './production';
import { type Copy, RovoAtlassian, SUB_SPEED } from './rovoAtlassian';
import { buildOutput } from './rovoCode';
import type { Step, Task } from './rovoTasks';
import type { OutputLine } from './shipOutput';
import { fly, until, wait } from './timeline';

/** The story's beats, in order. */
export const ON_CALL_BEATS = ['arriving', 'detect', 'declare', 'triage', 'mitigate', 'verify', 'resolve', 'learn', 'follow-up', 'done'] as const;
export type OnCallBeat = (typeof ON_CALL_BEATS)[number];
/** The systems round Jira this story calls on: the runbook's Confluence, and the incident apps. */
export const ON_CALL_MINI = ['confluence', 'jsm', 'compass', 'statuspage'] as const;

/** Seconds between incident updates in Slack, by severity: often at SEV1, rarely at SEV3. */
const COMMS_BEAT: Record<1 | 2 | 3, number> = { 1: 2.2, 2: 4, 3: 7 };
const WORK: [number, number] = [1.1, 1.9];

/** Where each lead looks. Logs are read at the service itself. */
const LEAD_STEPS: Record<Lead, Step[]> = {
  runbook: [{ system: 'confluence', action: 'read' }],
  dependencies: [{ system: 'compass', action: 'read' }],
  deploys: [
    { system: 'bitbucket', action: 'read' },
    { system: 'codesearch', action: 'read' },
  ],
  logs: [],
};
const LEAD_TITLE: Record<Lead, string> = {
  runbook: 'Check the runbook',
  dependencies: 'Map the blast radius',
  deploys: 'Check recent deploys',
  logs: 'Read the logs',
};
const MITIGATION_TITLE: Record<Mitigation, string> = {
  rollback: 'Roll back',
  hotfix: 'Ship a hotfix to',
  failover: 'Fail over',
  'scale-out': 'Scale out',
  'flag-off': 'Turn off the flag on',
};
const CAUSE_TITLE: Record<Incident['cause'], string> = {
  deploy: 'failing after a deploy',
  dependency: 'down',
  spike: 'overloaded',
  config: 'failing after a config change',
};
/** Wrong first lead: a runbook that doesn't apply, then Code search. */
const DETOUR: Step[] = [
  { system: 'confluence', action: 'read' },
  { system: 'codesearch', action: 'read' },
];
const HOTFIX: Task = { type: 'code', steps: [{ system: 'bitbucket', action: 'code' }] };
const POSTMORTEM: Task = { type: 'doc', steps: [{ system: 'confluence', action: 'write' }] };

/** What the comms copy does next: a message in Slack, or a status update on Statuspage (the last one lets it go). */
type CommsJob = 'slack' | 'status' | 'final-status';

/**
 * Rovo on Call (Story Narrative): production pages, and Rovo runs the
 * incident from page to postmortem, built from the same pieces as the other
 * Rovo stories and by the same rules (docs/rovo-mental-model.md). Every seed
 * is a different incident on a different map (rollIncident, storyMap).
 *
 * 1. Rovo comes in the way it always does, and idles in Jira.
 * 2. Detect: production comes up past the portal, all green; one service
 *    goes red, and everything that depends on it yellow. JSM comes up off
 *    Jira; the alert rides in (from the monitoring tool beside JSM, or JSM's
 *    own), and a red incident card lands on Jira's board.
 * 3. Declare: Rovo moves to JSM and takes the incident as commander. A comms
 *    copy opens the incident channel (Slack comes up), pages the human on
 *    the user's terminal (SEV1, half of SEV2), and posts to Statuspage
 *    (SEV1–2). Updates go out on a beat set by the severity until it's over.
 * 4. Triage: one to three copies, each with a lead (runbook, blast radius in
 *    Compass, recent deploys, logs at the service). One finds it, maybe after
 *    a wrong first lead.
 * 5. Mitigate: that copy stops the bleeding: a rollback (the last good
 *    release rides back out through the portal to the service), a hotfix
 *    (the full code lane, maybe a flaky CI run), a failover or scale-out
 *    (replicas grow in beside the service), or a flag turned off.
 * 6. Verify: a terminal tails the service's logs; lights go green, the
 *    culprit first, then upstream. "Mitigated" goes out.
 * 7. Resolve: spike replicas fold away, "Resolved" goes out and Statuspage
 *    folds; Rovo goes back to Jira and the incident card goes green to Done.
 * 8. Learn: a copy writes the postmortem in Confluence; its link goes to Slack.
 * 9. Follow up: one to four follow-up cards slide into To do, and stay.
 *    Everyone goes home into Rovo.
 */
export class RovoOnCall extends RovoAtlassian {
  readonly incident: Incident;
  readonly production: Production;
  /** Where the story is now. */
  beat: OnCallBeat = 'arriving';
  /** The story has run to its end. */
  finished = false;
  /** Status updates posted on Statuspage, and messages the comms copy sent in Slack. */
  statusUpdates = 0;
  commsMessages = 0;
  /** The incident card, while Rovo holds it. */
  incidentCard?: Ticket;
  private readonly comms: CommsJob[] = [];
  private commsOpen = false;
  private statusUp = false;

  constructor(stage: SceneHost, seed = 5) {
    super(stage, seed, { mini: ON_CALL_MINI, production: true, via: { datadog: 'jsm', grafana: 'jsm' } });
    this.incident = rollIncident(seed);
    // The monitoring tool stands beside JSM, its line straight into it.
    if (this.map.monitorAt) this.places.datadog = this.places.grafana = this.map.monitorAt;
    this.production = new Production(stage, this.map.production!, this.map.code, this.incident);
    // One release per fix: a single deploy fills the assembler.
    this.deployCubes = 8;
    this.flakyCI = this.incident.flakyCI;
  }

  override async start(): Promise<void> {
    const { stage, hub, production, incident } = this;
    const rovo = this.rovo.drone;
    const { culprit } = incident;
    const service = incident.services[culprit];
    this.running = true;
    await this.enter();
    // Quiet: Rovo idles in Jira.
    rovo.status = 'waiting';
    this.jira.light = 'off';
    await wait(stage, 0.6);

    // Detect: production is up and healthy, then one service goes red and what depends on it yellow.
    this.beat = 'detect';
    await production.comeUp();
    await wait(stage, 1.2);
    production.health(culprit, 'stopped');
    for (const i of incident.degraded) {
      await wait(stage, 0.35);
      production.health(i, 'waiting');
    }
    await wait(stage, 0.8);
    // The page: JSM comes up off Jira; the alert rides in, and a red card lands on the board.
    const jsm = await this.systems.establish('jsm');
    if (incident.source !== 'jsm') {
      const monitor = await this.systems.call(incident.source);
      monitor.node.light = 'working';
      await this.systems.report(incident.source);
      monitor.node.light = 'off';
    } else {
      jsm.node.light = 'working';
      await this.systems.report('jsm');
      jsm.node.light = 'off';
    }
    await hub.showBoard();
    await hub.addTask(true);

    // Declare: Rovo moves to JSM and takes the incident.
    this.beat = 'declare';
    rovo.status = 'working';
    this.jira.light = 'working';
    await fly(stage, DroneFlight.to(rovo, jsm.node.position, { speed: 3 }));
    jsm.node.light = 'working';
    const atJsm = attachSignal(stage, rovo, jsm.node);
    this.incidentCard =
      (await hub.takeTask(rovo.rig.hover, undefined, {
        key: `INC-${200 + this.map.seed}`,
        title: `SEV${incident.sev}: ${service.name} ${CAUSE_TITLE[incident.cause]}`,
        incident: true,
      })) ?? undefined;
    this.commsOpen = true;
    const comms = this.runComms();

    // Triage: a copy per lead, all at once.
    this.beat = 'triage';
    await wait(stage, 1);
    for (let i = 0; i < incident.leads.length; i++) await hub.addTask();
    const crew = await Promise.all(
      incident.leads.map(async (lead, k) => {
        await wait(stage, k * 0.5);
        const copy = await this.emerge();
        await this.investigate(copy, lead);
        return { copy, lead };
      }),
    );
    const fixer = crew.find((c) => c.lead === incident.find)!.copy;

    // Mitigate: the copy that found it stops the bleeding.
    this.beat = 'mitigate';
    await hub.addTask();
    await this.mitigate(fixer);

    // Verify: the logs at the service tail until they pass; lights go green, the culprit first, then upstream.
    this.beat = 'verify';
    await hub.addTask();
    await this.verify(fixer);
    this.say('slack');
    if (this.statusUp) this.say('status');

    // Resolve: spike replicas fold away; "Resolved" goes out; Rovo closes the incident in Jira.
    this.beat = 'resolve';
    if (incident.mitigation === 'scale-out') {
      for (const replica of [...production.replicas].reverse()) await production.removeReplica(replica);
    }
    this.say('slack');
    if (this.statusUp) this.say('final-status');
    if (incident.source !== 'jsm') void this.systems.release(incident.source);
    atJsm.detach();
    jsm.node.light = 'off';
    await fly(stage, DroneFlight.to(rovo, this.map.jira, { speed: 3 }));
    if (this.incidentCard) await hub.finish(this.incidentCard, this.jira);
    this.incidentCard = undefined;

    // Learn: the postmortem goes into Confluence, and its link to Slack.
    this.beat = 'learn';
    await hub.addTask();
    const writer = crew.find((c) => c.lead === 'runbook')?.copy ?? fixer;
    await this.handOver(writer, POSTMORTEM, -1, this.issue('Write the postmortem'));
    this.say('slack');

    // Follow up: the comms copy wraps up; follow-up cards slide into To do and stay there.
    this.beat = 'follow-up';
    this.commsOpen = false;
    const talker = await comms;
    rovo.flash = 1;
    for (let i = 0; i < incident.followUps; i++) await hub.addTask();
    await wait(stage, 0.8);

    // Everyone home into Rovo.
    this.running = false;
    await Promise.all([talker, ...crew.map((c) => c.copy)].map((c, i) => this.home(c, i * 0.25)));
    rovo.status = 'waiting';
    this.jira.light = 'off';
    this.beat = 'done';
    this.finished = true;
  }

  /** The output, when a fix first needs it: the line, the assembler and the belt, into production's portal; every release goes on to the failing service. */
  protected override buildOutputLine(): Promise<OutputLine> {
    this.building ??= buildOutput(
      this.stage,
      this.map.code,
      () => {
        this.shipped++;
        void this.production.deliver(this.incident.culprit);
      },
      this.production.portal,
    ).then((output) => (this.output = output));
    return this.building;
  }

  /** The next Jira issue's key, with its title. */
  private issue(title: string): { key: string; title: string } {
    return { key: `OPS-${++this.issues}`, title };
  }

  /** Queue something for the comms copy to send. */
  private say(job: CommsJob): void {
    this.comms.push(job);
  }

  /** Rovo hands `copy` the next card off the board; it starts on it. */
  private async take(copy: Copy, title: string): Promise<Ticket | null> {
    const rovo = this.rovo.drone;
    const { drone } = copy.sub;
    rovo.flash = 1;
    const card = await this.hub.takeTask(drone.rig.hover, rovo.rig.hover, this.issue(title));
    if (!card) return null;
    drone.status = 'working';
    this.copies.set(drone, { card });
    return card;
  }

  /** The copy is done: it shoots its card back to Rovo and waits where it is. */
  private async done(copy: Copy, card: Ticket | null): Promise<void> {
    const rovo = this.rovo.drone;
    if (card) await this.hub.finish(card, rovo.rig.hover);
    rovo.flash = 1;
    this.copies.set(copy.sub.drone, {});
    copy.sub.drone.status = 'waiting';
  }

  /** The copy flies to `at` and hovers there. */
  private async goTo(copy: Copy, at: Vector3): Promise<void> {
    await fly(this.stage, DroneFlight.to(copy.sub.drone, at, { speed: SUB_SPEED, fromHeight: copy.from, lift: 0 }));
    copy.from = 0;
  }

  /** One step at a system: fly there (it comes up if it isn't), work it, and report to Jira (a read brings what it found home; a write stays). */
  private async visit(copy: Copy, step: Step): Promise<void> {
    const at = this.systems.placed.get(step.system)?.node.position ?? (this.places[step.system] as Vector3);
    await this.goTo(copy, at);
    const system = await this.systems.call(step.system);
    await this.work(copy.sub.drone, system.node, step);
    if (step.action === 'read') void this.systems.report(step.system, step.system);
    else {
      this.systems.writeBack(step.system);
      void this.systems.report(step.system);
    }
    void this.systems.release(step.system);
  }

  /** The copy hovers over a production service and works it (reads its logs, makes a fix there). */
  private async atService(copy: Copy, i: number, work: () => Promise<void>): Promise<void> {
    const node = this.production.nodes[i];
    await this.goTo(copy, node.position);
    const { drone } = copy.sub;
    this.working.set(drone, node);
    const signal = attachSignal(this.stage, drone, node);
    await work();
    signal.detach();
    this.working.delete(drone);
  }

  /** A triage copy follows its lead. The one that finds it may first follow a wrong lead. */
  private async investigate(copy: Copy, lead: Lead): Promise<void> {
    const { incident, production, stage } = this;
    const finds = lead === incident.find;
    const card = await this.take(copy, LEAD_TITLE[lead]);
    const steps = [...(finds && incident.wrongLead ? DETOUR : []), ...LEAD_STEPS[lead]];
    for (const step of steps) await this.visit(copy, step);
    if (lead === 'dependencies') {
      // Over Compass, the copy traces the failing service's lines.
      const node = this.systems.placed.get('compass')!.node;
      this.working.set(copy.sub.drone, node);
      node.light = 'working';
      await production.trace(incident.culprit);
      node.light = 'off';
      this.working.delete(copy.sub.drone);
    }
    if (lead === 'logs') {
      // At the service: the failing one if this is the lead that finds it, otherwise one it's dragging down.
      const at = finds ? incident.culprit : (incident.degraded[0] ?? 0);
      await this.atService(copy, at, () => wait(stage, this.between(WORK)));
    }
    await this.done(copy, card);
  }

  /** The fix, by the dice. */
  private async mitigate(copy: Copy): Promise<void> {
    const { incident, production, stage } = this;
    const { culprit } = incident;
    const name = incident.services[culprit].name;
    const title = `${MITIGATION_TITLE[incident.mitigation]} ${name}`;
    if (incident.mitigation === 'hotfix') {
      // The full code lane: worktree, diff, check-in, CI, squash merge, deploy; the release goes out to the service.
      await this.handOver(copy, HOTFIX, 0, this.issue(title));
      await until(stage, () => production.delivered >= 1);
      return;
    }
    const card = await this.take(copy, title);
    if (incident.mitigation === 'rollback') {
      // At Bitbucket: the last good release goes out again, down the line, through the portal, to the service.
      const repo = this.systems.placed.get(this.scm)!;
      await this.goTo(copy, repo.node.position);
      this.working.set(copy.sub.drone, repo.node);
      repo.node.light = 'working';
      const signal = attachSignal(stage, copy.sub.drone, repo.node);
      await wait(stage, this.between(WORK));
      const output = await this.buildOutputLine();
      for (let sent = 0, tries = 0; sent < this.deployCubes && tries < 80; tries++) {
        if (output.commit()) sent++;
        await wait(stage, 0.12);
      }
      signal.detach();
      repo.node.light = 'off';
      this.working.delete(copy.sub.drone);
      await this.done(copy, card);
      await until(stage, () => production.delivered >= 1);
      return;
    }
    await this.atService(copy, culprit, async () => {
      if (incident.mitigation === 'flag-off') {
        await production.flagOff(culprit);
        return;
      }
      // Failover: a standby grows in and takes over. Scale out: 1–3 replicas grow in beside it, as many as there's room for.
      const spots = production.spotsBeside(culprit).slice(0, incident.replicas);
      for (const [k, spot] of spots.entries()) {
        const replica = await production.addReplica(culprit, spot, incident.mitigation === 'failover' ? `${name}-standby` : `${name}-${k + 2}`);
        if (incident.mitigation === 'failover') replica.node.light = 'working';
      }
      if (incident.mitigation === 'failover') production.health(culprit, 'off');
    });
    await this.done(copy, card);
  }

  /** A terminal tails the service's logs while the lights recover; then it folds back into the copy. */
  private async verify(copy: Copy): Promise<void> {
    const { incident, production, stage } = this;
    const { culprit } = incident;
    const card = await this.take(copy, `Watch the logs at ${incident.services[culprit].name}`);
    const spot = production.spotsBeside(culprit)[0];
    const recover = async () => {
      if (incident.mitigation !== 'failover') {
        production.health(culprit, 'waiting');
        await wait(stage, 0.9);
        production.health(culprit, 'working');
      }
      for (const i of incident.degraded) {
        await wait(stage, 0.45);
        production.health(i, 'working');
      }
    };
    if (spot) {
      await this.goTo(copy, spot);
      const { terminal, fold } = await production.logsTerminal(culprit, spot, this.tasks.length + 23);
      this.working.set(copy.sub.drone, terminal);
      await wait(stage, 0.6);
      await recover();
      await wait(stage, 0.6);
      terminal.pass();
      await wait(stage, 0.6);
      await fold();
      this.working.delete(copy.sub.drone);
    } else await this.atService(copy, culprit, recover);
    await this.done(copy, card);
  }

  /**
   * The comms copy, for as long as the incident runs: it opens the incident
   * channel (Slack comes up for it), pages the human if the severity calls for
   * it, posts to Statuspage at SEV1–2, and keeps updates going out in Slack on
   * the severity's beat. Queued messages (mitigated, resolved, the
   * postmortem) go out as they come. Then it shoots its card back to Rovo.
   */
  private async runComms(): Promise<Copy> {
    const { stage, hub, incident } = this;
    const copy = await this.emerge();
    await hub.addTask();
    const card = await this.take(copy, 'Run the incident comms');
    const { drone } = copy.sub;
    let signal: { detach: () => void } | undefined;
    const atSlack = async () => {
      await this.goTo(copy, this.map.slack.at);
      await this.slack.bringUp();
      this.working.set(drone, this.slack.node);
      signal = attachSignal(stage, drone, this.slack.node);
    };
    const leaveSlack = () => {
      signal?.detach();
      this.working.delete(drone);
    };
    const send = async () => {
      await this.slack.send();
      this.commsMessages++;
    };
    const post = async (last: boolean) => {
      leaveSlack();
      // Statuspage comes up for the first update and stays while the incident runs; the last one lets it go.
      const up = this.systems.placed.get('statuspage');
      await this.goTo(copy, up?.node.position ?? (this.places.statuspage as Vector3));
      const page = up ?? (await this.systems.call('statuspage'));
      this.statusUp = !last;
      await this.work(drone, page.node, { system: 'statuspage', action: 'write' });
      this.systems.writeBack('statuspage');
      void this.systems.report('statuspage');
      this.statusUpdates++;
      if (last) void this.systems.release('statuspage');
      await atSlack();
    };

    // The incident channel opens.
    await atSlack();
    await send();
    if (incident.paged) {
      // The human on call is paged on the user's terminal, and acks.
      leaveSlack();
      await this.goTo(copy, this.map.userTerminal);
      const terminal = await this.userTerminal();
      this.working.set(drone, terminal);
      terminal.state = 'tail';
      await wait(stage, this.between(WORK));
      terminal.pass();
      await wait(stage, 0.5);
      terminal.state = 'admin';
      this.userReports++;
      await atSlack();
    }
    if (incident.sev <= 2) await post(false);

    let since = 0;
    while (this.commsOpen || this.comms.length) {
      const job = this.comms.shift();
      if (job === 'slack') await send();
      else if (job) await post(job === 'final-status');
      else {
        await wait(stage, 0.25);
        since += 0.25;
        if (this.commsOpen && since >= COMMS_BEAT[incident.sev]) {
          since = 0;
          await send();
        }
      }
    }
    leaveSlack();
    await this.done(copy, card);
    return copy;
  }
}
