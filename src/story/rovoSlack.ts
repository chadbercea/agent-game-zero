import { LineCurve3, Vector3 } from 'three';
import { NODE_FOOTPRINT } from '../core/grid';
import type { SharedRun } from '../core/sharedRuns';
import { reversed } from '../primitives/branch/gridPath';
import { Gateway } from '../primitives/gateway/Gateway';
import { GraphEdge } from '../primitives/graph/GraphEdge';
import { SystemNode } from '../primitives/node/SystemNode';
import type { SceneHost } from '../stage/Stage';
import { shoot } from './beam';
import { tween, wait } from './timeline';

/** Slack stands on its own at the top, straight up the grid from Jira, behind its gateway. */
export const SLACK_AT = new Vector3(-3, 0, -7);
/** The glass gateway on Slack's line, two squares long. */
export const SLACK_RUN: SharedRun = { along: 'z', from: -5, to: -3, low: -3, high: -3 };
const MESSAGE_SPEED = 7;
/** Seconds between messages in the background chatter (seeded). */
const CHATTER: [number, number] = [0.3, 0.9];

/**
 * Slack, the comms hub (docs/rovo-mental-model.md): a standalone, secure node
 * that just catches comms and sends comms, always busy. It comes up the first
 * time a copy of Rovo goes to send a message (under that copy), then builds
 * out toward Jira: its line draws to the gateway, the glass gateway scales up
 * and its lock drops in, and the line draws on to Jira. From then on messages
 * stream through the gateway both ways, all the time, whether or not a task
 * is using it. A task's message (`send`) shows as an entry: the gateway flashes
 * and its lock sways.
 */
export class SlackHub {
  readonly node = new SystemNode({ kind: 'slack' });
  readonly gateway = new Gateway(SLACK_RUN);
  /** Slack → the gateway's far end. */
  readonly toGateway: GraphEdge;
  /** The gateway's near end → Jira's plate. */
  readonly toJira: GraphEdge;
  /** Slack is up and chattering. */
  up = false;
  /** Messages through the gateway so far (both ways). */
  messages = 0;
  private readonly path: LineCurve3;
  private coming?: Promise<void>;

  constructor(
    private readonly stage: SceneHost,
    jiraEdge: Vector3,
    private readonly random: () => number,
  ) {
    const slackEdge = SLACK_AT.clone().setZ(SLACK_AT.z + NODE_FOOTPRINT / 2 + 0.1);
    this.toGateway = new GraphEdge(new LineCurve3(slackEdge, new Vector3(SLACK_AT.x, 0, SLACK_RUN.from)));
    this.toJira = new GraphEdge(new LineCurve3(new Vector3(SLACK_AT.x, 0, SLACK_RUN.to), jiraEdge.clone()));
    this.path = new LineCurve3(slackEdge.clone(), jiraEdge.clone());
    this.node.position.copy(SLACK_AT);
    this.node.scale.setScalar(0.001);
    this.node.labelOpacity = 0;
    this.node.visible = false;
    for (const e of [this.toGateway, this.toJira]) e.drawn = 0;
    this.gateway.built = 0;
    this.gateway.visible = false;
    stage.add(this.node, this.toGateway, this.toJira, this.gateway);
    stage.onTick((dt) => {
      if (!this.gateway.visible) return;
      this.gateway.update(dt);
      this.toGateway.update(dt);
      this.toJira.update(dt);
    });
  }

  /** Bring Slack up for the copy that's come to send something (once): node, line, gateway, line, then the chatter starts. */
  bringUp(): Promise<void> {
    this.coming ??= (async () => {
      const { stage, node, gateway } = this;
      node.visible = true;
      await tween(stage, 0.4, (t) => {
        node.scale.setScalar(Math.max(0.001, easeOutBack(t)));
        node.labelOpacity = t;
      });
      await tween(stage, 0.5, (t) => (this.toGateway.drawn = t));
      gateway.visible = true;
      await tween(stage, 0.5, (t) => (gateway.built = t));
      await tween(stage, 0.4, (t) => (gateway.lockDrop = t));
      await tween(stage, 0.7, (t) => (this.toJira.drawn = t));
      gateway.conduit.streams = 1;
      this.up = true;
      void this.chatter();
    })();
    return this.coming;
  }

  /** A task's message goes out through the gateway into Jira's record: the gateway flashes, its lock sways. */
  async send(): Promise<void> {
    this.gateway.grant();
    this.messages++;
    await shoot(this.stage, this.path, MESSAGE_SPEED, undefined, 'slack');
  }

  /** Always busy: messages in and out through the gateway, on a seeded, irregular beat. */
  private async chatter(): Promise<void> {
    for (;;) {
      await wait(this.stage, CHATTER[0] + this.random() * (CHATTER[1] - CHATTER[0]));
      this.messages++;
      void shoot(this.stage, this.random() < 0.5 ? this.path : reversed(this.path), MESSAGE_SPEED, undefined, 'slack');
    }
  }
}

function easeOutBack(t: number): number {
  const c = 1.6;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}
