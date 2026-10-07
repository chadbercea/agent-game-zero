import { Group, LineCurve3, type Object3D, Vector3 } from 'three';
import { GateAnimator } from '../animation/GateAnimator';
import { GATE_FOOTPRINT, NODE_FOOTPRINT } from '../core/grid';
import { NEUTRAL } from '../core/palette';
import { Branch } from '../primitives/branch/Branch';
import { Gate, type GateState } from '../primitives/gate/Gate';
import type { SystemKind } from '../primitives/node/emblems';
import { Product } from '../primitives/product/Product';
import type { SceneHost } from '../stage/Stage';
import type { ReviewedItem, Verdict, WorkItem, WorkLedger } from './ledger';

/** The review gate is node-sized: the gate primitive scaled down to a node's footprint. */
export const REVIEW_SCALE = NODE_FOOTPRINT / GATE_FOOTPRINT;
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
/** A request's parts, shown above the gate while it's reviewed: how high, how far apart, how dim a missing one is. */
const RACK_HEIGHT = 1.05;
const RACK_SPACING = 0.34;
const MISSING_OPACITY = 0.16;
/** The rack runs along screen-right, so it reads as a row. */
const ACROSS = new Vector3(1, 0, -1).normalize();
/** The rack stays up this long after the verdict, then fades. */
const RACK_HOLD = 1.6;
const RACK_FADE = 0.5;

/** What a request is made of, for review to show: the parts it has, and the parts it's missing. */
export interface Parts {
  present: readonly SystemKind[];
  missing: readonly SystemKind[];
}

/** What review needs of its gate: somewhere to be, and a state to show. A real Gate unless a test injects one. */
export type ReviewGate = Object3D & { state: GateState };

interface Submission {
  item: WorkItem;
  kind?: SystemKind;
  verdict?: Verdict;
  parts?: Parts;
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
 * to the ledger. Reviews come one at a time, faster when work piles up; past
 * a point the overflow is reviewed without being drawn, so the counts keep up
 * with the volume.
 *
 * Ordinary requests, each the work of one system, pass. Review denies only
 * what's missing context: a request whose parts come from several systems
 * and arrive without some of them. The story decides DEMO-1's verdict and
 * passes its parts (`submit`), which show above the gate while it's reviewed:
 * the parts it has, and dim empty slots for the ones it's missing. It's open
 * for submissions only while `open` is set.
 */
export class Review {
  readonly gate: ReviewGate;
  readonly trace: Branch;
  open = false;
  private readonly queue: Submission[] = [];
  /** The parts rack of the request with parts under (or just past) review, and how long it has left. */
  private rack: { group: Group; products: Product[]; left: number } | null = null;
  private current: { s: Submission; product: Product; t: number; verdict: Verdict; recorded: boolean } | null = null;
  private stats = { reviewed: 0, confirmed: 0, denied: 0, recent: [] as ReviewedItem[] };
  private readonly from: Vector3;
  private readonly to: Vector3;

  constructor(
    private readonly stage: SceneHost,
    readonly position: Vector3,
    mainGate: Vector3,
    private readonly ledger: WorkLedger,
    options: { gate?: ReviewGate } = {},
  ) {
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
   * Send a finished request to review. Resolves with the verdict. Ordinary
   * requests pass; `verdict` decides one (the story's DEMO-1), and `parts`
   * shows what it's made of while it's reviewed. Ordinary requests are dropped
   * while review is closed (resolving 'confirmed' unrecorded); decided ones
   * always go.
   */
  submit(item: WorkItem, kind?: SystemKind, verdict?: Verdict, parts?: Parts): Promise<Verdict> {
    if (!this.open && !verdict) return Promise.resolve('confirmed');
    if (!verdict && this.queue.length >= MAX_WAITING) {
      this.record(item, 'confirmed');
      return Promise.resolve('confirmed');
    }
    return new Promise((resolve) => this.queue.push({ item, kind, verdict, parts, resolve }));
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
    this.clearRack();
  }

  /** Is a request's parts rack up right now? */
  get showingParts(): boolean {
    return this.rack !== null;
  }

  private showRack(parts: Parts): void {
    this.clearRack();
    const group = new Group();
    group.position.copy(this.position).setY(RACK_HEIGHT);
    const all = [...parts.present, ...parts.missing];
    const products = all.map((kind, i) => {
      const product = new Product(kind);
      const offset = (i - (all.length - 1) / 2) * RACK_SPACING;
      product.position.copy(ACROSS).multiplyScalar(offset);
      if (parts.missing.includes(kind)) {
        // An empty slot: the part's outline, barely there.
        product.material.transparent = true;
        product.material.opacity = MISSING_OPACITY;
        product.material.depthWrite = false;
        product.castShadow = false;
      }
      group.add(product);
      return product;
    });
    this.stage.add(group);
    this.rack = { group, products, left: Infinity };
  }

  private clearRack(): void {
    if (!this.rack) return;
    for (const p of this.rack.products) p.dispose();
    this.rack.group.removeFromParent();
    this.rack = null;
  }

  private updateRack(dt: number): void {
    const rack = this.rack;
    if (!rack || rack.left === Infinity) return;
    rack.left -= dt;
    // Review dwells on this verdict, light on, while the parts are up; then it moves on.
    if (rack.left <= 0) this.gate.state = 'off';
    const fade = Math.min(1, Math.max(0, rack.left / RACK_FADE));
    for (const p of rack.products) {
      p.material.transparent = true;
      p.material.opacity = Math.min(p.material.opacity, fade);
    }
    if (rack.left <= 0) this.clearRack();
  }

  private record(item: WorkItem, verdict: Verdict): void {
    this.ledger.setVerdict(item.key, verdict);
    this.stats.reviewed++;
    this.stats[verdict]++;
    this.stats.recent = [{ ...item, verdict }, ...this.stats.recent.filter((r) => r.key !== item.key)].slice(0, RECENT);
  }

  private update(dt: number): void {
    this.updateRack(dt);
    if (!this.current) {
      if (this.rack) return; // still dwelling on a verdict with parts
      const s = this.queue.shift();
      if (!s) return;
      const product = new Product(s.kind ?? 'github');
      product.position.copy(this.from).setY(RIDE_HEIGHT);
      this.stage.add(product);
      this.current = { s, product, t: 0, verdict: s.verdict ?? 'confirmed', recorded: false };
      if (s.parts) this.showRack(s.parts);
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
      // A request shown with its parts keeps the verdict light on while the parts stay up.
      if (c.s.parts && this.rack) this.rack.left = RACK_HOLD;
      else this.gate.state = 'off';
      c.product.dispose();
      this.current = null;
      c.s.resolve(c.verdict);
    }
  }
}
