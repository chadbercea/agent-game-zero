import { LineCurve3, Vector3 } from 'three';
import { NODE_FOOTPRINT } from '../core/grid';
import { reversed } from '../primitives/branch/gridPath';
import { Gateway } from '../primitives/gateway/Gateway';
import { GraphEdge } from '../primitives/graph/GraphEdge';
import { SystemNode } from '../primitives/node/SystemNode';
import type { SceneHost } from '../stage/Stage';
import { shoot } from './beam';
import { nodeFacts, SYSTEM_LABEL } from './rovoInspect';
import type { SlackPlace } from './storyMap';
import { tween, wait } from './timeline';
import { groundNode, type PanelWays } from './units';

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
  readonly node = new SystemNode({ kind: 'slack', showLabel: false });
  readonly gateway: Gateway;
  /** Slack → the gateway's far end. */
  readonly toGateway: GraphEdge;
  /** The gateway's near end → Jira's edge. */
  readonly toJira: GraphEdge;
  /** Slack is up and chattering. */
  up = false;
  /** Messages through the gateway so far (both ways). */
  messages = 0;
  private readonly path: LineCurve3;
  private coming?: Promise<void>;

  constructor(
    private readonly stage: SceneHost,
    /** Where Slack stands (from the story's map): straight out from Jira, its gateway on the line between. */
    readonly place: SlackPlace,
    jiraEdge: Vector3,
    private readonly random: () => number,
    /** Where its line leaves Slack: its unit's border, toward Jira. */
    slackEdge = place.at.clone().addScaledVector(place.out, -(NODE_FOOTPRINT / 2 + 0.1)),
    /** Which way its ground panel lies (the map's). */
    ways: PanelWays = new Map(),
  ) {
    groundNode(ways, 'slack', this.node, 1, () => nodeFacts(this.node, SYSTEM_LABEL.slack));
    this.gateway = new Gateway(place.run);
    this.toGateway = new GraphEdge(new LineCurve3(slackEdge, place.slackEnd.clone()));
    this.toJira = new GraphEdge(new LineCurve3(place.jiraEnd.clone(), jiraEdge.clone()));
    this.path = new LineCurve3(slackEdge.clone(), jiraEdge.clone());
    this.node.position.copy(place.at);
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
