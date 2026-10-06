import { BoxGeometry, type Color, Group, MathUtils, type Mesh, MeshStandardMaterial } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { FACE_CAMERA } from '../../core/grid';
import { makeLabel } from '../../core/label';
import { solid } from '../../core/mesh';
import { NEUTRAL, STATUS_COLOR } from '../../core/palette';
import { buildEmblem, type SystemKind } from '../node/emblems';

/** One piece of the work, and the system it comes from. */
export interface TicketRow {
  kind: SystemKind;
  name: string;
}

/** What someone asked for, and the work it takes: the request every act of the story works on. */
export interface Request {
  key: string;
  title: string;
  rows: readonly TicketRow[];
}

export const DEFAULT_REQUEST: Request = {
  key: 'DEMO-1',
  title: 'Add dark mode',
  rows: [
    { kind: 'figma', name: 'Design' },
    { kind: 'github', name: 'Branch' },
    { kind: 'notion', name: 'PRD' },
    { kind: 'confluence', name: 'Spec' },
    { kind: 'jira', name: 'Issue link' },
  ],
};

/** Where the work stands. To Do until an agent gets access; Blocked when a gate says no. */
export type TicketStatus = 'todo' | 'progress' | 'blocked' | 'done';
export const TICKET_STATUSES: readonly TicketStatus[] = ['todo', 'progress', 'blocked', 'done'];

const STATUS_CHIP: Record<TicketStatus, Color> = {
  todo: NEUTRAL.offLight,
  progress: STATUS_COLOR.working,
  blocked: STATUS_COLOR.stopped,
  done: STATUS_COLOR.working,
};

/** How high the card floats over the floor when it's set down. */
export const TICKET_HOVER = 0.9;
/** How far the card leans back from upright, so its face catches the isometric camera. */
const LEAN = 0.3;
const BOB = 0.035;
const BOB_SPEED = 1.6;
/** Seconds the hand-off glow takes to settle back to neutral. */
const GLOW_DECAY = 0.9;
/** Seconds a row's box takes to pop when it's ticked. */
const TICK_POP = 0.35;

const CARD_W = 1.15;
const ROW_H = 0.2;
const HEAD_H = 0.42;
const CARD_D = 0.05;
const EMBLEM_SCALE = 0.36;

let shared: { chip: BoxGeometry; status: BoxGeometry; rule: BoxGeometry; box: RoundedBoxGeometry } | undefined;

interface Row {
  kind: SystemKind;
  box: Mesh;
  material: MeshStandardMaterial;
  pop: number;
  done: boolean;
}

/**
 * Ticket primitive: a request and its work. A white card standing up to face
 * the camera: a key chip and a status chip across the top, a ruled title,
 * then one row per piece of work, marked with the emblem of the system it
 * comes from and a box that turns green when it's done. The key and title
 * float above it. `glow` lights the whole card green for a moment when it
 * hands work to an agent.
 *
 * Rig hooks: `card` (the floating part; whoever drops, carries or lifts the
 * ticket moves it), `status`, `tick(kind)`, and `opacity`.
 */
export class Ticket extends Group {
  readonly request: Request;
  readonly card = new Group();
  readonly label: CSS2DObject;
  private readonly face = new Group();
  private readonly shell: MeshStandardMaterial;
  private readonly graphite: MeshStandardMaterial;
  private readonly chipMaterial: MeshStandardMaterial;
  private readonly rows: Row[];
  private readonly materials: MeshStandardMaterial[] = [];
  private _status: TicketStatus = 'todo';
  private glowLevel = 0;
  private bobPhase = 0;
  private _opacity = 1;

  constructor(request: Request = DEFAULT_REQUEST) {
    super();
    this.request = request;
    const g = (shared ??= {
      chip: new BoxGeometry(0.26, 0.08, 0.016),
      status: new BoxGeometry(0.3, 0.09, 0.02),
      rule: new BoxGeometry(1, 0.035, 0.012),
      box: new RoundedBoxGeometry(0.11, 0.11, 0.03, 2, 0.02),
    });
    this.shell = this.track(new MeshStandardMaterial({ color: NEUTRAL.shell, roughness: 0.55 }));
    this.shell.emissive.copy(STATUS_COLOR.working);
    this.shell.emissiveIntensity = 0;
    this.graphite = this.track(new MeshStandardMaterial({ color: NEUTRAL.graphite, roughness: 0.6 }));
    this.chipMaterial = this.track(new MeshStandardMaterial({ color: NEUTRAL.offLight, roughness: 0.4 }));

    const cardH = HEAD_H + request.rows.length * ROW_H + 0.12;
    const top = cardH / 2;
    this.face.rotation.set(-LEAN, FACE_CAMERA, 0, 'YXZ');
    this.card.add(this.face);
    this.card.position.y = TICKET_HOVER;
    this.add(this.card);

    const front = CARD_D / 2 + 0.006;
    const place = <T extends Mesh | Group>(object: T, x: number, y: number, z = front): T => {
      object.position.set(x, y, z);
      this.face.add(object);
      return object;
    };
    place(solid(new RoundedBoxGeometry(CARD_W, cardH, CARD_D, 2, 0.05), this.shell), 0, 0, 0);
    const left = -CARD_W / 2;
    // Header: key chip, status chip, the title as a ruled line.
    place(solid(g.chip, this.graphite), left + 0.2, top - 0.12);
    place(solid(g.status, this.chipMaterial), CARD_W / 2 - 0.22, top - 0.12);
    place(solid(g.rule, this.graphite), left + 0.45, top - 0.28).scale.x = 0.76;

    // One row per piece of work: box, the system's emblem, a ruled line.
    this.rows = request.rows.map((row, i) => {
      const y = top - HEAD_H - ROW_H * (i + 0.5);
      const material = this.track(new MeshStandardMaterial({ color: NEUTRAL.shellShade, roughness: 0.5 }));
      material.emissive.copy(STATUS_COLOR.working);
      material.emissiveIntensity = 0;
      const box = place(solid(g.box, material), left + 0.14, y);
      const emblem = buildEmblem(row.kind, { shell: this.shell, graphite: this.graphite });
      emblem.scale.setScalar(EMBLEM_SCALE);
      place(emblem, left + 0.33, y, front + 0.02);
      place(solid(g.rule, this.graphite), left + 0.77, y).scale.x = 0.54 - (i % 2) * 0.12;
      return { kind: row.kind, box, material, pop: 1, done: false };
    });

    this.label = makeLabel(`${request.key} · ${request.title}`);
    this.label.position.y = top + 0.3;
    this.card.add(this.label);
    this.applyStatus();
  }

  get status(): TicketStatus {
    return this._status;
  }

  set status(status: TicketStatus) {
    this._status = status;
    this.applyStatus();
  }

  /** Mark the row for this system done: its box pops and turns green. Returns false if there's no such row. */
  tick(kind: SystemKind): boolean {
    const row = this.rows.find((r) => r.kind === kind);
    if (!row) return false;
    if (!row.done) row.pop = 0;
    row.done = true;
    row.material.color.copy(STATUS_COLOR.working);
    row.material.emissiveIntensity = 0.6;
    return true;
  }

  /** Is this system's row done? */
  isDone(kind: SystemKind): boolean {
    return this.rows.some((r) => r.kind === kind && r.done);
  }

  /** How many rows are done. */
  get doneCount(): number {
    return this.rows.filter((r) => r.done).length;
  }

  /** Back to a fresh ticket: To Do, nothing ticked. */
  reset(): void {
    for (const row of this.rows) {
      row.done = false;
      row.pop = 1;
      row.box.scale.setScalar(1);
      row.material.color.copy(NEUTRAL.shellShade);
      row.material.emissiveIntensity = 0;
    }
    this.glowLevel = 0;
    this.status = 'todo';
  }

  /** Light the card green (0–1); it settles back on its own in `update`. */
  set glow(level: number) {
    this.glowLevel = MathUtils.clamp(level, 0, 1);
  }

  get glow(): number {
    return this.glowLevel;
  }

  /** Fade card and label together (0 = gone, 1 = solid). */
  set opacity(value: number) {
    this._opacity = MathUtils.clamp(value, 0, 1);
    const fading = this._opacity < 1;
    for (const m of this.materials) {
      m.transparent = fading;
      m.opacity = this._opacity;
    }
    this.label.element.style.opacity = String(this._opacity);
  }

  get opacity(): number {
    return this._opacity;
  }

  update(dt: number): void {
    this.glowLevel = Math.max(0, this.glowLevel - dt * GLOW_DECAY);
    this.shell.emissiveIntensity = this.glowLevel * 0.9;
    for (const row of this.rows) {
      if (row.pop >= 1) continue;
      row.pop = Math.min(1, row.pop + dt / TICK_POP);
      // Overshoot, then settle: a box clicking done.
      row.box.scale.setScalar(1 + Math.sin(row.pop * Math.PI) * 0.6);
    }
    // A gentle float.
    this.bobPhase += dt * BOB_SPEED;
    this.face.position.y = Math.sin(this.bobPhase) * BOB;
  }

  dispose(): void {
    this.removeFromParent();
    this.label.element.remove();
    for (const m of this.materials) m.dispose();
  }

  private applyStatus(): void {
    this.chipMaterial.color.copy(STATUS_CHIP[this._status]);
    this.chipMaterial.emissive.copy(STATUS_CHIP[this._status]);
    this.chipMaterial.emissiveIntensity = this._status === 'todo' ? 0 : 0.7;
  }

  private track(material: MeshStandardMaterial): MeshStandardMaterial {
    this.materials.push(material);
    return material;
  }
}
