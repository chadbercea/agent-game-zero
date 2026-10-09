import { BoxGeometry, Color, Group, type Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { solid } from '../core/mesh';
import { NEUTRAL, STATUS_COLOR } from '../core/palette';

export const BOARD_W = 1.5;
export const BOARD_H = 1.05;
/** Cards a column holds; To do fills up to this and new tasks wait. */
export const COLUMN_MAX = 4;
const CARD_W = 0.38;
const CARD_H = 0.15;
const COLUMN_X = [-0.48, 0, 0.48];
const TOP_ROW = 0.27;
const ROW_GAP = 0.2;
const FACE = 0.045;
/** Where a card comes in from (left of the board) and goes off to (right of it). */
const ENTER_X = -BOARD_W / 2 - 0.35;
const LEAVE_X = BOARD_W / 2 + 0.35;
const EASE = 7;
/** Cards are a touch whiter than the board, and stand proud of it, so white on white still reads. */
const CARD_WHITE = new Color('#ffffff');
/** The board faces the camera, away from the key light: a little self-light keeps it reading white, not gray. */
const LIFT = 0.45;

export type Column = 0 | 1 | 2;

/** One card on the board. It eases toward `target`; a leaving card fades out and goes. */
export interface KanbanCard {
  readonly mesh: Mesh;
  readonly material: MeshStandardMaterial;
  readonly target: Vector3;
  column: Column;
  opacity: number;
  glow: number;
  leaving: boolean;
}

let cardGeometry: RoundedBoxGeometry | undefined;

/**
 * Jira's kanban board, big enough to read: an all-white board with three
 * columns (To do, In progress, Done) of white cards. Cards slide in from the
 * left into To do, move across as work starts and finishes (a finished card
 * glows green), and slide off the right to make room.
 */
export class KanbanBoard extends Group {
  readonly columns: [KanbanCard[], KanbanCard[], KanbanCard[]] = [[], [], []];
  private readonly leaving: KanbanCard[] = [];

  constructor() {
    super();
    const board = new MeshStandardMaterial({ color: NEUTRAL.shell, emissive: NEUTRAL.shell, emissiveIntensity: LIFT, roughness: 0.55 });
    const shade = new MeshStandardMaterial({ color: NEUTRAL.shellShade, emissive: NEUTRAL.shellShade, emissiveIntensity: LIFT * 0.6, roughness: 0.5 });
    this.add(solid(new RoundedBoxGeometry(BOARD_W, BOARD_H, 0.05, 2, 0.02), board));
    for (const x of COLUMN_X) {
      const header = solid(new BoxGeometry(CARD_W, 0.035, 0.02), shade);
      header.position.set(x, BOARD_H / 2 - 0.1, 0.03);
      this.add(header);
    }
    for (const x of [-0.24, 0.24]) {
      const rule = solid(new BoxGeometry(0.012, BOARD_H - 0.16, 0.012), shade);
      rule.position.set(x, -0.03, 0.028);
      this.add(rule);
    }
  }

  /** A new card slides in from the left into To do. */
  addCard(): KanbanCard {
    cardGeometry ??= new RoundedBoxGeometry(CARD_W, CARD_H, 0.03, 2, 0.012);
    const material = new MeshStandardMaterial({ color: CARD_WHITE, roughness: 0.4, transparent: true, opacity: 0 });
    const mesh = solid(cardGeometry, material);
    const card: KanbanCard = { mesh, material, target: new Vector3(), column: 0, opacity: 1, glow: 0, leaving: false };
    mesh.position.set(ENTER_X, TOP_ROW - this.columns[0].length * ROW_GAP, FACE);
    this.add(mesh);
    this.columns[0].push(card);
    this.layout();
    return card;
  }

  /** The card moves over a column (work starts: 1; work is done: 2, and it glows green). */
  moveCard(card: KanbanCard, to: Column): void {
    const from = this.columns[card.column];
    from.splice(from.indexOf(card), 1);
    card.column = to;
    this.columns[to].push(card);
    if (to === 2) card.glow = 1;
    this.layout();
  }

  /** The card slides off the right of the board and goes. */
  removeCard(card: KanbanCard): void {
    const from = this.columns[card.column];
    const i = from.indexOf(card);
    if (i < 0) return;
    from.splice(i, 1);
    card.leaving = true;
    card.opacity = 0;
    card.target.x = LEAVE_X;
    this.leaving.push(card);
    this.layout();
  }

  update(dt: number): void {
    const k = 1 - Math.exp(-EASE * dt);
    for (const card of [...this.columns.flat(), ...this.leaving]) {
      card.mesh.position.lerp(card.target, k);
      card.material.opacity += (card.opacity - card.material.opacity) * k;
      card.material.depthWrite = card.material.opacity > 0.98;
      card.glow = Math.max(0, card.glow - dt * 0.6);
      card.material.color.copy(CARD_WHITE).lerp(STATUS_COLOR.working, card.glow * 0.8);
      card.material.emissive.copy(CARD_WHITE).multiplyScalar(LIFT * 1.2 * (1 - card.glow)).lerp(STATUS_COLOR.working, card.glow * 0.5);
    }
    for (let i = this.leaving.length - 1; i >= 0; i--) {
      const card = this.leaving[i];
      if (card.material.opacity > 0.02) continue;
      card.mesh.removeFromParent();
      card.material.dispose();
      this.leaving.splice(i, 1);
    }
  }

  dispose(): void {
    this.removeFromParent();
    for (const card of [...this.columns.flat(), ...this.leaving]) card.material.dispose();
  }

  private layout(): void {
    this.columns.forEach((cards, c) =>
      cards.forEach((card, row) => card.target.set(COLUMN_X[c], TOP_ROW - Math.min(row, COLUMN_MAX - 1) * ROW_GAP, FACE)),
    );
  }
}
