import { LineCurve3, type Object3D, type Vector3 } from 'three';
import { GateAnimator } from '../animation/GateAnimator';
import { GATE_FOOTPRINT, NODE_FOOTPRINT } from '../core/grid';
import { NEUTRAL } from '../core/palette';
import { seededRandom } from '../core/scatter';
import { Branch } from '../primitives/branch/Branch';
import { Gate, type GateState } from '../primitives/gate/Gate';
import type { SystemKind } from '../primitives/node/emblems';
import { Product } from '../primitives/product/Product';
import type { SceneHost } from '../stage/Stage';
import type { ReviewedItem, Verdict, WorkItem, WorkLedger } from './ledger';

/** The review gate is node-sized: the gate primitive scaled down to a node's footprint. */
export const REVIEW_SCALE = NODE_FOOTPRINT / GATE_FOOTPRINT;
/** Share of ordinary requests review sends back. Most go green. */
const DENY_ODDS = 0.05;
/** A full-pace review: the item rides in, the gate thinks, then shows its verdict. */
const RIDE_SECONDS = 0.55;
const THINK_SECONDS = 0.7;
const VERDICT_SECONDS = 0.45;
/** With this many waiting, reviews run at their fastest. */
const BUSY = 6;
const FASTEST = 0.35;
/** Past this many waiting, ordinary requests are reviewed without being drawn (the counts still move). */
const MAX_WAITING = 10;
const RIDE_HEIGHT = 0.2;
/** How many verdicts the review remembers for its card. */
const RECENT = 4;

/** What review needs of its gate: somewhere to be, and a state to show. A real Gate unless a test injects one. */
export type ReviewGate = Object3D & { state: GateState };

interface Submission {
  item: WorkItem;
  kind?: SystemKind;
  verdict?: Verdict;
  resolve: (v: Verdict) => void;
}

/** What review has done today. */
export interface ReviewStats {
  reviewed: number;
  confirmed: number;
  denied: number;
  /** The last few verdicts, newest first. */
  recent: readonly ReviewedItem[];
}

/**
 * Review: "is this right?", the closing gate. One node-sized gate beside
 * D3V1N's gate, joined to it by a short trace. Every request the agents
 * finish goes through it: its product rides the trace in, the gate thinks
 * (yellow), then confirms (green) or denies (red), and the verdict is written
 * to the ledger. Most go green. Reviews come one at a time, faster when work
 * piles up; past a point the overflow is reviewed without being drawn, so the
 * counts keep up with the volume.
 *
 * `submit` can force a verdict (the story decides DEMO-1's). It's open for
 * submissions only while `open` is set.
 */
export class Review {
  readonly gate: ReviewGate;
  readonly trace: Branch;
  open = false;
  private readonly queue: Submission[] = [];
  private readonly random: () => number;
  private current: { s: Submission; product: Product; t: number; verdict: Verdict; recorded: boolean } | null = null;
  private stats = { reviewed: 0, confirmed: 0, denied: 0, recent: [] as ReviewedItem[] };
  private readonly from: Vector3;
  private readonly to: Vector3;

  constructor(
    private readonly stage: SceneHost,
    readonly position: Vector3,
    mainGate: Vector3,
    private readonly ledger: WorkLedger,
    seed = 1,
    options: { gate?: ReviewGate } = {},
  ) {
    this.random = seededRandom(seed);
    let animator: GateAnimator | undefined;
    if (options.gate) this.gate = options.gate;
    else {
      const gate = new Gate();
      animator = new GateAnimator(gate);
      this.gate = gate;
    }
    this.gate.position.copy(position);
    this.gate.scale.setScalar(REVIEW_SCALE);
    // The trace runs from the main gate's edge to the review gate's edge.
    const dir = position.clone().sub(mainGate).setY(0).normalize();
    this.from = mainGate.clone().addScaledVector(dir, GATE_FOOTPRINT / 2);
    this.to = position.clone().addScaledVector(dir, -NODE_FOOTPRINT / 2);
    this.trace = new Branch(new LineCurve3(this.from, this.to), NEUTRAL.packet);
    stage.add(this.gate, this.trace);
    this.visible = false;
    stage.onTick((dt) => {
      animator?.update(dt);
      this.update(dt);
    });
  }

  /** Show or hide the gate and its trace (it belongs to D3V1N's system: shown while that system is mapped). */
  set visible(on: boolean) {
    this.gate.visible = on;
    this.trace.visible = on;
    this.trace.drawn = on ? 1 : 0;
  }

  get visible(): boolean {
    return this.gate.visible;
  }

  /** Waiting to be reviewed, not counting the one under review. */
  get waiting(): number {
    return this.queue.length;
  }

  summary(): ReviewStats {
    return { ...this.stats, recent: [...this.stats.recent] };
  }

  /**
   * Send a finished request to review. Resolves with the verdict. `verdict`
   * forces it; otherwise most go green. Ordinary requests are dropped while
   * review is closed (resolving 'confirmed' unrecorded); forced ones always go.
   */
  submit(item: WorkItem, kind?: SystemKind, verdict?: Verdict): Promise<Verdict> {
    if (!this.open && !verdict) return Promise.resolve('confirmed');
    if (!verdict && this.queue.length >= MAX_WAITING) {
      const v = this.decide();
      this.record(item, v);
      return Promise.resolve(v);
    }
    return new Promise((resolve) => this.queue.push({ item, kind, verdict, resolve }));
  }

  /** Clear the queue and anything under review; the gate goes off. Stats for the day stay. */
  reset(): void {
    for (const s of this.queue.splice(0)) s.resolve(s.verdict ?? 'confirmed');
    if (this.current) {
      this.current.product.dispose();
      this.current.s.resolve(this.current.verdict);
      this.current = null;
    }
    this.gate.state = 'off';
  }

  private decide(): Verdict {
    return this.random() < DENY_ODDS ? 'denied' : 'confirmed';
  }

  private record(item: WorkItem, verdict: Verdict): void {
    this.ledger.setVerdict(item.key, verdict);
    this.stats.reviewed++;
    this.stats[verdict]++;
    this.stats.recent = [{ ...item, verdict }, ...this.stats.recent.filter((r) => r.key !== item.key)].slice(0, RECENT);
  }

  private update(dt: number): void {
    if (!this.current) {
      const s = this.queue.shift();
      if (!s) return;
      const product = new Product(s.kind ?? 'github');
      product.position.copy(this.from).setY(RIDE_HEIGHT);
      this.stage.add(product);
      this.current = { s, product, t: 0, verdict: s.verdict ?? this.decide(), recorded: false };
    }
    const c = this.current;
    // Faster when work piles up, never below FASTEST of full pace; forced items take the full beat.
    const pace = c.s.verdict ? 1 : Math.max(FASTEST, 1 - (this.queue.length / BUSY) * (1 - FASTEST));
    c.t += dt / pace;
    const ride = RIDE_SECONDS;
    const think = ride + THINK_SECONDS;
    const done = think + VERDICT_SECONDS;
    if (c.t < ride) {
      c.product.position.lerpVectors(this.from, this.to, c.t / ride).setY(RIDE_HEIGHT);
      c.product.scale.setScalar(Math.min(1, (c.t / ride) * 4));
    } else if (c.t < think) {
      c.product.scale.setScalar(Math.max(0.001, 1 - (c.t - ride) / 0.2));
      this.gate.state = 'thinking';
    }
    // Once thinking is over the verdict is in, even if a long frame skipped straight past it.
    if (c.t >= think && !c.recorded) {
      c.recorded = true;
      c.product.scale.setScalar(0.001);
      this.gate.state = c.verdict === 'confirmed' ? 'open' : 'denied';
      this.record(c.s.item, c.verdict);
    }
    if (c.t >= done) {
      this.gate.state = 'off';
      c.product.dispose();
      this.current = null;
      c.s.resolve(c.verdict);
    }
  }
}
