import { BoxGeometry, Group, MathUtils, MeshStandardMaterial, SphereGeometry } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { FACE_CAMERA } from '../../core/grid';
import { makeLabel } from '../../core/label';
import { solid } from '../../core/mesh';
import { NEUTRAL, STATUS_COLOR } from '../../core/palette';

/** What someone asked for: the request every act of the story works on. */
export interface Request {
  key: string;
  title: string;
}

export const DEFAULT_REQUEST: Request = { key: 'DEMO-1', title: 'Add dark mode' };

/** How high the card floats over its spot on the floor. */
export const TICKET_HOVER = 0.9;
/** How far the card leans back from upright, so its face catches the isometric camera. */
const LEAN = 0.3;
const BOB = 0.035;
const BOB_SPEED = 1.6;
/** Seconds the hand-off glow takes to settle back to neutral. */
const GLOW_DECAY = 0.9;

const CARD_W = 1.1;
const CARD_H = 0.74;
/** The card's height, for whoever holds it by its top edge (a Hand). */
export const TICKET_CARD_H = CARD_H;
const CARD_D = 0.05;

let shared:
  | { card: RoundedBoxGeometry; chip: BoxGeometry; rule: BoxGeometry; avatar: SphereGeometry }
  | undefined;

export interface TicketOptions {
  /** Float the key and title over the card. Off for the small tickets that trickle through the system. */
  label?: boolean;
}

/**
 * Ticket primitive: a request, the work someone asked for. A white card
 * standing up to face the camera, with a key chip, two ruled lines of title,
 * and the requester (a small graphite avatar) in the corner; its key and
 * title float above it. Neutral like every work product: `glow` lights it
 * green for a moment when it hands work to an agent.
 *
 * Rig hooks: `card` (the floating part; whoever drops or lifts the ticket
 * moves it) and `opacity` (fades card and label together).
 */
export class Ticket extends Group {
  readonly request: Request;
  readonly card = new Group();
  readonly label?: CSS2DObject;
  private readonly shell: MeshStandardMaterial;
  private readonly graphite: MeshStandardMaterial;
  private glowLevel = 0;
  private bobPhase = 0;
  private _opacity = 1;

  constructor(request: Request = DEFAULT_REQUEST, { label = true }: TicketOptions = {}) {
    super();
    this.request = request;
    const g = (shared ??= {
      card: new RoundedBoxGeometry(CARD_W, CARD_H, CARD_D, 2, 0.05),
      chip: new BoxGeometry(0.28, 0.08, 0.016),
      rule: new BoxGeometry(0.76, 0.04, 0.014),
      avatar: new SphereGeometry(0.075, 14, 10),
    });
    this.shell = new MeshStandardMaterial({ color: NEUTRAL.shell, roughness: 0.55 });
    this.shell.emissive.copy(STATUS_COLOR.working);
    this.shell.emissiveIntensity = 0;
    this.graphite = new MeshStandardMaterial({ color: NEUTRAL.graphite, roughness: 0.6 });

    const face = new Group();
    face.rotation.set(-LEAN, FACE_CAMERA, 0, 'YXZ');
    this.card.add(face);
    this.card.position.y = TICKET_HOVER;
    this.add(this.card);

    const front = CARD_D / 2 + 0.004;
    const place = (mesh: ReturnType<typeof solid>, x: number, y: number, z = front) => {
      mesh.position.set(x, y, z);
      face.add(mesh);
      return mesh;
    };
    place(solid(g.card, this.shell), 0, 0, 0);
    place(solid(g.chip, this.graphite), -CARD_W / 2 + 0.22, CARD_H / 2 - 0.14);
    place(solid(g.rule, this.graphite), -0.07, 0.03);
    place(solid(g.rule, this.graphite), -0.165, -0.08).scale.x = 0.75;
    place(solid(g.avatar, this.graphite), CARD_W / 2 - 0.14, -CARD_H / 2 + 0.14);

    if (label) {
      this.label = makeLabel(`${request.key} · ${request.title}`);
      this.label.position.y = CARD_H / 2 + 0.35;
      this.card.add(this.label);
    }
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
    for (const m of [this.shell, this.graphite]) {
      m.transparent = fading;
      m.opacity = this._opacity;
    }
    if (this.label) this.label.element.style.opacity = String(this._opacity);
  }

  get opacity(): number {
    return this._opacity;
  }

  update(dt: number): void {
    this.glowLevel = Math.max(0, this.glowLevel - dt * GLOW_DECAY);
    this.shell.emissiveIntensity = this.glowLevel * 0.9;
    // A gentle float: the request waits on the grid for someone to pick it up.
    this.bobPhase += dt * BOB_SPEED;
    this.card.children[0].position.y = Math.sin(this.bobPhase) * BOB;
  }

  dispose(): void {
    this.removeFromParent();
    this.label?.element.remove();
    this.shell.dispose();
    this.graphite.dispose();
  }
}
