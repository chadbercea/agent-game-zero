import { CanvasTexture, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry, Shape, ShapeGeometry, SRGBColorSpace, Vector3 } from 'three';
import type { Status } from '../../core/palette';
import { type NodeLight, SystemNode, type SystemNodeOptions } from '../node/SystemNode';
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
/** Below this scale a folding unit no longer keeps the grid off the floor. */
const CLAIM_MIN_SCALE = 0.05;
const worldPosition = new Vector3();
const worldScale = new Vector3();

/**
 * Grounded unit primitive (ILI-1070): a system node and its panel, drawn as
 * one footprint on the floor. The node holds the unit's upper-left corner;
 * the panel lies flat beside it (`direction` 'x') or below it ('z'), showing
 * the node card's facts; one light gray border wraps both. Lines end on the
 * border, each at its own point (unitLayout's pickAttachments). The unit's
 * origin is the node's center, so place it on a grid point like any node,
 * and bring it up or fold it away by its scale, as nodes do. While it's up,
 * the grid under any line stays off its floor (groundClaims).
 */
export class GroundUnit extends Group {
  readonly node: SystemNode;
  readonly direction: PanelDirection;
  /** Its parts, in the unit's own frame. */
  readonly layout: UnitLayout;
  private readonly canvas: HTMLCanvasElement;
  private readonly texture: CanvasTexture;
  private readonly panel: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly border: Mesh<ShapeGeometry, MeshBasicMaterial>;

  constructor(options: SystemNodeOptions & { direction: PanelDirection; panel: GroundPanelData }) {
    super();
    this.direction = options.direction;
    this.layout = unitLayout(options.direction);
    this.name = `unit:${options.kind}`;

    // The panel names it, so the node's floating name tag stays off.
    this.node = new SystemNode({ ...options, showLabel: false });
    this.add(this.node);

    const { panel, border } = this.layout;
    const width = panel.maxX - panel.minX;
    const depth = panel.maxZ - panel.minZ;
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(width * CARD_PX * SUPERSAMPLE);
    this.canvas.height = Math.round(depth * CARD_PX * SUPERSAMPLE);
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.panel = new Mesh(
      new PlaneGeometry(width, depth),
      new MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false }),
    );
    // Flat on the floor, reading the right way up from the camera (top of the text toward -Z).
    this.panel.rotation.x = -Math.PI / 2;
    this.panel.position.set((panel.minX + panel.maxX) / 2, PANEL_Y, (panel.minZ + panel.maxZ) / 2);
    this.panel.renderOrder = -1;
    this.add(this.panel);

    this.border = new Mesh(
      outlineGeometry(border, BORDER_WIDTH, BORDER_RADIUS),
      new MeshBasicMaterial({ color: BORDER_COLOR, depthWrite: false, side: DoubleSide }),
    );
    this.border.rotation.x = Math.PI / 2;
    this.border.position.y = BORDER_Y;
    this.border.renderOrder = -1;
    this.add(this.border);

    this.show(options.panel);
    this.userData[GROUND_CLAIM] = (() => {
      const k = this.getWorldScale(worldScale).x;
      if (k < CLAIM_MIN_SCALE) return null;
      const p = this.getWorldPosition(worldPosition);
      return offsetRect(scaleRect(this.layout.border, k), p.x, p.z);
    }) satisfies GroundClaim;
  }

  /** The border's rectangle on the floor at full size, where the unit stands (for attach points). */
  get footprint(): FloorRect {
    return offsetRect(this.layout.border, this.position.x, this.position.z);
  }

  /** Paint the panel with `data` (call again when the node's state changes). */
  show(data: GroundPanelData): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.scale(SUPERSAMPLE, SUPERSAMPLE);
    paintNodePanel(ctx, data, this.canvas.width / SUPERSAMPLE);
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.removeFromParent();
    this.node.dispose();
    this.texture.dispose();
    this.panel.geometry.dispose();
    this.panel.material.dispose();
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

/**
 * The node card on a strip `width` card pixels wide: the head (tile, "Tool",
 * name) and the facts on the left, what it's linked to on the right.
 */
function paintNodePanel(ctx: CanvasRenderingContext2D, d: GroundPanelData, width: number): void {
  ctx.textBaseline = 'top';
  ctx.letterSpacing = '0px';

  // Head: the tile with the name's first letter, then the eyebrow and the name.
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
  label(ctx, 'Tool', PAD + 46, PAD + 2, 0.08);
  ctx.fillStyle = INK;
  ctx.font = `650 16px ${FONT}`;
  ctx.fillText(d.name, PAD + 46, PAD + 16, width / 2);

  // Facts: names in gray, values in ink.
  const activity = d.light === 'off' ? 'Idle' : `${STATUS_WORD[d.light]} now`;
  const rows: [string, string][] = [
    ['System', d.system],
    ['Makes', d.makes],
    ['Activity', activity],
  ];
  ctx.font = `12px ${FONT}`;
  const keyWidth = Math.max(...rows.map(([k]) => ctx.measureText(k).width));
  const left = width * 0.56;
  rows.forEach(([k, v], i) => {
    const y = PAD + 36 + 10 + i * (LINE + 1);
    ctx.font = `12px ${FONT}`;
    ctx.fillStyle = QUIET;
    ctx.fillText(k, PAD, y);
    ctx.font = `550 12px ${FONT}`;
    ctx.fillStyle = INK;
    ctx.fillText(v, PAD + keyWidth + 12, y, left - PAD - keyWidth - 24);
  });

  // Linked on the graph: chips, wrapping.
  label(ctx, 'Linked on the graph', left, PAD + 2, 0.06);
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
