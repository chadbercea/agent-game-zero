import { CanvasTexture, DoubleSide, Group, Mesh, MeshBasicMaterial, type Object3D, PlaneGeometry, Shape, ShapeGeometry, SRGBColorSpace, Vector3 } from 'three';
import { NODE_FOOTPRINT } from '../../core/grid';
import type { Status } from '../../core/palette';
import type { NodeLight } from '../node/SystemNode';
import { GROUND_CLAIM, type GroundClaim } from './groundClaims';
import { type FloorRect, offsetRect, type PanelDirection, scaleRect, type UnitLayout, unitLayout } from './unitLayout';

/** What the panel shows: the node card's facts (inspectCards' nodeCard), laid out for a strip on the floor. */
export interface GroundPanelData {
  name: string;
  /** Whose system it's in. */
  system: string;
  light: NodeLight;
  /** What it produces, in words. */
  makes: string;
  /** Systems the graph links it to. */
  linked: readonly string[];
  /** Something that isn't a tool (the gate): its card's eyebrow (and no letter tile), its facts in place of System, Makes and Activity, and its list's label. */
  eyebrow?: string;
  facts?: readonly (readonly [string, string])[];
  linkedLabel?: string;
}

/** The border: a light gray outline, the card's own edge color, and the only edge treatment. */
const BORDER_COLOR = '#e3e4e8';
const BORDER_WIDTH = 0.025;
const BORDER_RADIUS = 0.12;
/** Just above the floor grid (0.004), so neither flickers through the other. */
const BORDER_Y = 0.006;
const PANEL_Y = 0.005;
/** Panel text: card pixels per world unit (the card's type at 350px across the panel's long side), and canvas pixels per card pixel. */
const CARD_PX = 140;
const SUPERSAMPLE = 4;

/** The card's type, colors and spacing (inspectCards' STYLE). */
const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
const INK = '#1d1e22';
const QUIET = '#8a8c93';
const MUTED = '#6b6e76';
const TILE = '#f1f2f4';
const CHIP_EDGE = '#e3e4e8';
const PAD = 12;
const LINE = 12 * 1.4;
const STATUS_WORD: Record<Status, string> = { working: 'Working', waiting: 'Waiting', stopped: 'Stopped' };
/** The facts block (card pixels): where it starts down the panel, and room for this many rows. */
const FACTS_TOP = PAD + 36 + 10;
const FACTS_ROWS = 3;
/** The share of the panel's width the head and facts take, left of the list. */
const FACTS_SHARE = 0.56;
/** The facts lie just above the rest of the panel. */
const FACTS_Y = PANEL_Y + 0.0005;
/** Below this scale a folding unit no longer keeps the grid off the floor. */
const CLAIM_MIN_SCALE = 0.05;
const worldPosition = new Vector3();
const worldScale = new Vector3();

export interface GroundPanelOptions {
  direction: PanelDirection;
  /** The node's scale when it's fully up (a hub or a Teamwork Graph app stands bigger); the panel stays true size whatever it is. */
  fullScale?: number;
  /** How wide the node stands at scale 1 (a gate stands wider than a node). */
  nodeSize?: number;
  /** Its parts, if not a node's (a secure gateway's: runLayout); `direction` then only names the way the panel lies. */
  layout?: UnitLayout;
  /** What to show, read fresh each frame; the panel repaints when it changes. */
  data: () => GroundPanelData;
}

/**
 * Ground panel primitive (ILI-1070): the floor half of a grounded unit. It
 * hangs off a system node as its child, so it comes up, folds away and hides
 * with the node, and everything that uses the node's position still finds
 * the node's center. The node holds the unit's upper-left corner; the panel
 * lies flat beside it (`direction` 'x') or below it ('z'), showing the node
 * card's facts; one light gray border wraps both. Lines end on the border
 * (unitLayout). While the node is up, the grid under any line stays off the
 * unit's floor (groundClaims). Make the node with `showLabel: false`: the
 * panel names it.
 */
export class GroundPanel extends Group {
  readonly direction: PanelDirection;
  /** Its parts, in world units about the node's center at full size. */
  readonly layout: UnitLayout;
  private readonly data: () => GroundPanelData;
  /** What changes rarely (the head and the list), and the facts that change as the story runs (activity, the gate's state): painted and sent to the GPU apart, so a change in one fact sends only the small facts block. */
  private readonly base: PanelLayer;
  private readonly facts: PanelLayer;
  private readonly border: Mesh<ShapeGeometry, MeshBasicMaterial>;

  constructor(node: Object3D, options: GroundPanelOptions) {
    super();
    const fullScale = options.fullScale ?? 1;
    this.direction = options.direction;
    this.layout = options.layout ?? unitLayout(options.direction, (options.nodeSize ?? NODE_FOOTPRINT) * fullScale);
    this.data = options.data;
    this.name = 'ground-panel';
    // Undo the node's own scale, so at full size the panel is true size.
    this.scale.setScalar(1 / fullScale);
    node.add(this);

    const { panel, border } = this.layout;
    const width = panel.maxX - panel.minX;
    const depth = panel.maxZ - panel.minZ;
    this.base = new PanelLayer(width, depth, panel.minX, panel.minZ, PANEL_Y);
    this.base.mesh.onBeforeRender = () => this.refresh();
    this.add(this.base.mesh);
    const factsTop = FACTS_TOP / CARD_PX;
    this.facts = new PanelLayer(width * FACTS_SHARE, (FACTS_ROWS * (LINE + 1) + 4) / CARD_PX, panel.minX, panel.minZ + factsTop, FACTS_Y);
    this.add(this.facts.mesh);

    this.border = new Mesh(
      outlineGeometry(border, BORDER_WIDTH, BORDER_RADIUS),
      new MeshBasicMaterial({ color: BORDER_COLOR, depthWrite: false, side: DoubleSide }),
    );
    this.border.rotation.x = Math.PI / 2;
    this.border.position.y = BORDER_Y;
    this.border.renderOrder = -1;
    this.add(this.border);

    this.refresh();
    this.userData[GROUND_CLAIM] = (() => {
      const k = this.getWorldScale(worldScale).x;
      if (k < CLAIM_MIN_SCALE) return null;
      const p = this.getWorldPosition(worldPosition);
      return offsetRect(scaleRect(this.layout.border, k), p.x, p.z);
    }) satisfies GroundClaim;
  }

  /** The border's rectangle on the floor at full size, where the node stands (for attach points and laying out). */
  get footprint(): FloorRect {
    const at = this.parent?.position ?? worldPosition.set(0, 0, 0);
    return offsetRect(this.layout.border, at.x, at.z);
  }

  /** Repaint whichever part of what it shows has changed. */
  refresh(): void {
    const d = this.data();
    const rows = factRows(d);
    this.base.paint(JSON.stringify({ ...d, light: undefined, facts: rows.map(([k]) => k) }), (ctx, w) => paintHead(ctx, d, w));
    this.facts.paint(JSON.stringify(rows), (ctx, w) => paintFacts(ctx, rows, w));
  }

  dispose(): void {
    this.removeFromParent();
    this.base.dispose();
    this.facts.dispose();
    this.border.geometry.dispose();
    this.border.material.dispose();
  }
}

/** A rounded-rectangle outline `width` thick, its outer edge on `rect`, as flat geometry in the XY plane (Y = floor Z). */
function outlineGeometry(rect: FloorRect, width: number, radius: number): ShapeGeometry {
  const outer = roundedRect(new Shape(), rect, radius);
  const inner = roundedRect(
    new Shape(),
    { minX: rect.minX + width, maxX: rect.maxX - width, minZ: rect.minZ + width, maxZ: rect.maxZ - width },
    radius - width,
  );
  outer.holes.push(inner);
  return new ShapeGeometry(outer, 12);
}

function roundedRect(shape: Shape, r: FloorRect, radius: number): Shape {
  shape.moveTo(r.minX + radius, r.minZ);
  shape.lineTo(r.maxX - radius, r.minZ);
  shape.quadraticCurveTo(r.maxX, r.minZ, r.maxX, r.minZ + radius);
  shape.lineTo(r.maxX, r.maxZ - radius);
  shape.quadraticCurveTo(r.maxX, r.maxZ, r.maxX - radius, r.maxZ);
  shape.lineTo(r.minX + radius, r.maxZ);
  shape.quadraticCurveTo(r.minX, r.maxZ, r.minX, r.maxZ - radius);
  shape.lineTo(r.minX, r.minZ + radius);
  shape.quadraticCurveTo(r.minX, r.minZ, r.minX + radius, r.minZ);
  return shape;
}

/** One flat layer of the panel: a canvas `width` × `depth` (world units) on the floor, its upper-left corner at (x, z). */
class PanelLayer {
  readonly mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly canvas = document.createElement('canvas');
  private readonly texture: CanvasTexture;
  private shown = '';

  constructor(width: number, depth: number, x: number, z: number, y: number) {
    this.canvas.width = Math.round(width * CARD_PX * SUPERSAMPLE);
    this.canvas.height = Math.round(depth * CARD_PX * SUPERSAMPLE);
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.mesh = new Mesh(new PlaneGeometry(width, depth), new MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false }));
    // Flat on the floor, reading the right way up from the camera (top of the text toward -Z).
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(x + width / 2, y, z + depth / 2);
    this.mesh.renderOrder = -1;
  }

  /** Repaint with `draw` (card pixels, `width` across) if `key` has changed since last time. */
  paint(key: string, draw: (ctx: CanvasRenderingContext2D, width: number) => void): void {
    if (key === this.shown) return;
    this.shown = key;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.scale(SUPERSAMPLE, SUPERSAMPLE);
    ctx.textBaseline = 'top';
    ctx.letterSpacing = '0px';
    draw(ctx, this.canvas.width / SUPERSAMPLE);
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

/** The facts down the left of the panel: System, Makes and Activity for a tool, or its own (the gate's). */
function factRows(d: GroundPanelData): readonly (readonly [string, string])[] {
  const activity = d.light === 'off' ? 'Idle' : `${STATUS_WORD[d.light]} now`;
  return (
    d.facts ?? [
      ['System', d.system],
      ['Makes', d.makes],
      ['Activity', activity],
    ]
  );
}

/** The facts, names in gray and values in ink, on a block `width` card pixels wide (the left of the panel). */
function paintFacts(ctx: CanvasRenderingContext2D, rows: readonly (readonly [string, string])[], width: number): void {
  ctx.font = `12px ${FONT}`;
  const keyWidth = Math.max(...rows.map(([k]) => ctx.measureText(k).width));
  const gap = keyWidth ? 12 : 0;
  rows.forEach(([k, v], i) => {
    const y = i * (LINE + 1);
    ctx.font = `12px ${FONT}`;
    ctx.fillStyle = QUIET;
    ctx.fillText(k, PAD, y);
    ctx.font = `550 12px ${FONT}`;
    ctx.fillStyle = INK;
    ctx.fillText(v, PAD + keyWidth + gap, y, width - PAD - keyWidth - gap - 12);
  });
}

/**
 * The node card on a strip `width` card pixels wide, but for its facts: the
 * head (tile, "Tool", name) on the left, what it's linked to on the right.
 */
function paintHead(ctx: CanvasRenderingContext2D, d: GroundPanelData, width: number): void {

  // Head: a tool's tile with the name's first letter, then the eyebrow and the name (clear of the list on the right).
  const left = width * FACTS_SHARE;
  const head = d.eyebrow ? PAD : PAD + 46;
  if (!d.eyebrow) {
    roundRect(ctx, PAD, PAD, 36, 36, 8);
    ctx.fillStyle = TILE;
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.font = `700 12px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(d.name.slice(0, 1), PAD + 18, PAD + 18);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
  }
  label(ctx, d.eyebrow ?? 'Tool', head, PAD + 2, 0.08);
  ctx.fillStyle = INK;
  ctx.font = `650 16px ${FONT}`;
  ctx.fillText(d.name, head, PAD + 16, left - head - PAD);

  // Linked on the graph: chips, wrapping.
  label(ctx, d.linkedLabel ?? 'Linked on the graph', left, PAD + 2, 0.06);
  ctx.font = `12px ${FONT}`;
  let x = left;
  let y = PAD + 18;
  if (!d.linked.length) {
    ctx.fillStyle = MUTED;
    ctx.fillText('not linked', x, y + 3);
  }
  for (const item of d.linked) {
    const w = ctx.measureText(item).width + 16;
    if (x + w > width - PAD && x > left) {
      x = left;
      y += LINE + 4 + 5;
    }
    roundRect(ctx, x + 0.5, y + 0.5, w - 1, LINE + 4 - 1, 6);
    ctx.strokeStyle = CHIP_EDGE;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.fillText(item, x + 8, y + 3);
    x += w + 5;
  }
}

/** A small uppercase label in the card's gray (eyebrow, section label). */
function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number): void {
  ctx.font = `600 10px ${FONT}`;
  ctx.fillStyle = QUIET;
  ctx.letterSpacing = `${spacing * 10}px`;
  ctx.fillText(text.toUpperCase(), x, y);
  ctx.letterSpacing = '0px';
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
