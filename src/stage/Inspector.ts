import {
  AlwaysStencilFunc,
  BackSide,
  Box3,
  Color,
  type Curve,
  Group,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  NotEqualStencilFunc,
  type Object3D,
  Quaternion,
  ReplaceStencilOp,
  TubeGeometry,
  Vector3,
} from 'three';
import { LINEAGE, type Lineage } from '../core/palette';
import type { Stage } from './Stage';

/** The kinds of thing on the grid you can inspect; each has a card of its own (see inspectCards). */
export type InspectKind = 'gate' | 'node' | 'agent' | 'sub-agent' | 'line' | 'ticket' | 'product' | 'gateway';

/** Something on the grid you can hover and click. */
export interface Inspectable {
  kind: InspectKind;
  object: Object3D;
  /** Its card, built fresh each time it's shown (so it reads live state). */
  card: () => HTMLElement;
  /** What the pointer hits, if not `object` itself (a fat invisible tube for a thin line). */
  hit?: Object3D;
  /** Light it up on hover its own way, instead of the shared lift and glow. */
  highlight?: (on: boolean) => void;
}

/** Seconds between refreshes of an open panel, so its numbers move while you look. */
const REFRESH_MS = 300;
/** Pointer travel (px) that still counts as a click, not a drag of the camera. */
const CLICK_SLOP = 5;

// Hover and selection light up the item itself (ILI-1003). Tune here.
/** How much a hovered or selected item grows (0.04 = 4%). Lines don't grow. */
const LIFT = 0.04;
/** Ease in and out of the lift and glow, in real milliseconds (not story time). */
const EASE_IN_MS = 80;
const EASE_OUT_MS = 150;
/** Glow in the item's own color: share of its color added as emissive (lit materials). */
const GLOW = 0.35;
/** Glow for unlit materials (lines, sprites): how much brighter their color gets. */
const GLOW_FLAT = 0.35;
/** Selection outline: thickness in world units, and how strong it is. */
const OUTLINE_WIDTH = 0.035;
const OUTLINE_OPACITY = 0.55;
/** Stencil value the selected item's pixels write, so its outline stays outside it. */
const STENCIL = 1;
/** Parts smaller than this (world units) get no outline of their own; they sit inside bigger ones. */
const OUTLINE_MIN_PART = 0.12;

const STYLE = `
.inspect-panel {
  position: fixed; z-index: 20; top: 16px; right: 16px; width: 300px; box-sizing: border-box;
  max-height: calc(100vh - 32px); overflow: auto; padding: 14px 16px 16px;
  font: 12px/1.4 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  color: #1d1e22; background: #fff; border: 1px solid #e3e4e8; border-radius: 10px;
  box-shadow: 0 10px 30px rgba(20, 22, 30, 0.12);
  display: none;
}
.inspect-panel.on { display: block; }
.inspect-panel .close {
  position: absolute; top: 8px; right: 8px; width: 24px; height: 24px; border: 0; border-radius: 6px;
  background: transparent; color: #8a8c93; font-size: 16px; line-height: 24px; cursor: pointer;
}
.inspect-panel .close:hover { background: #f1f2f4; color: #1d1e22; }
`;

let styled = false;

/** The one details panel: always on the right, fixed width, as tall as its card. */
export class InspectPanel {
  readonly element = document.createElement('aside');
  private readonly body = document.createElement('div');

  constructor(
    onClose: () => void,
    parent: HTMLElement = document.body,
  ) {
    if (!styled) {
      const style = document.createElement('style');
      style.textContent = STYLE;
      document.head.append(style);
      styled = true;
    }
    this.element.className = 'inspect-panel';
    const close = document.createElement('button');
    close.className = 'close';
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '×';
    close.addEventListener('click', onClose);
    this.element.append(close, this.body);
    parent.append(this.element);
  }

  show(card: HTMLElement): void {
    this.body.replaceChildren(card);
    this.element.classList.add('on');
  }

  hide(): void {
    this.element.classList.remove('on');
    this.body.replaceChildren();
  }

  get visible(): boolean {
    return this.element.classList.contains('on');
  }

  dispose(): void {
    this.element.remove();
  }
}

/**
 * Inspect anything on the grid (ILI-970): hovering an item lights it up
 * (nothing else); clicking it opens its card in the panel on the right.
 * Clicking another item swaps the panel to it; clicking empty floor, the ×,
 * or Escape deselects and the panel goes away. One mechanism for the whole
 * story: hand it the items (`items` is read on every pointer move, so it
 * follows what's on the grid now). Returns the inspector; `dispose()`
 * detaches it.
 *
 * Lighting up (ILI-1003): a hovered item lifts a little and glows in its own
 * color; a selected one holds that and adds a thin outline in its own color
 * while its card is open. Nothing is added under it. The lift and glow are
 * put on just before each frame is drawn and taken off right after, so they
 * never fight the story's own animation of scale and light.
 */
export class Inspector {
  readonly panel: InspectPanel;
  hovered: Inspectable | null = null;
  selected: Inspectable | null = null;
  private readonly lit = new Map<Object3D, Lit>();
  private readonly restore: (() => void)[] = [];
  private last = performance.now();
  private refresh: ReturnType<typeof setInterval> | undefined;
  private down: { x: number; y: number } | null = null;
  private readonly detach: () => void;

  constructor(
    private readonly stage: Stage,
    private readonly items: () => Inspectable[],
    parent?: HTMLElement,
  ) {
    this.panel = new InspectPanel(() => this.select(null), parent);

    const canvas = stage.renderer.domElement;
    const onMove = (e: PointerEvent) => this.hover(this.find(e.clientX, e.clientY));
    const onLeave = () => this.hover(null);
    const onDown = (e: PointerEvent) => (this.down = { x: e.clientX, y: e.clientY });
    const onUp = (e: PointerEvent) => {
      if (!this.down) return;
      const moved = Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y);
      this.down = null;
      if (moved > CLICK_SLOP) return;
      this.select(this.find(e.clientX, e.clientY));
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && this.select(null);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey);
    const untick = stage.onTick(() => this.light());
    const unrender = stage.onRendered(() => this.unlight());
    this.detach = () => {
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
      untick();
      unrender();
    };
  }

  /** Light up `item` (or nothing). Hover never opens the panel. */
  hover(item: Inspectable | null): void {
    if (item?.object === this.hovered?.object) return;
    const was = this.hovered;
    this.hovered = item;
    if (was && was.object !== this.selected?.object) was.highlight?.(false);
    item?.highlight?.(true);
    this.track(item);
    this.stage.renderer.domElement.style.cursor = item ? 'pointer' : '';
  }

  /** Open `item`'s card in the panel (swapping from whatever was open), or close it with null. */
  select(item: Inspectable | null): void {
    const was = this.selected;
    this.selected = item;
    if (was && was.object !== item?.object && was.object !== this.hovered?.object) was.highlight?.(false);
    this.track(item);
    clearInterval(this.refresh);
    if (!item) return this.panel.hide();
    this.panel.show(item.card());
    this.refresh = setInterval(() => {
      if (this.selected && isShown(this.selected.object)) this.panel.show(this.selected.card());
      else this.select(null);
    }, REFRESH_MS);
  }

  dispose(): void {
    this.detach();
    clearInterval(this.refresh);
    this.unlight();
    for (const l of this.lit.values()) {
      l.item.highlight?.(false);
      disposeOutline(l);
    }
    this.lit.clear();
    this.panel.dispose();
  }

  private find(x: number, y: number): Inspectable | null {
    const list = this.items().filter((i) => isShown(i.object));
    const hit = this.stage.pick(
      x,
      y,
      list.map((i) => i.hit ?? i.object),
    );
    if (!hit) return null;
    for (let o: Object3D | null = hit.object; o; o = o.parent) {
      const item = list.find((i) => (i.hit ?? i.object) === o);
      if (item) return item;
    }
    return null;
  }

  private track(item: Inspectable | null): void {
    if (item && !this.lit.has(item.object)) this.lit.set(item.object, { item, up: 0, held: 0 });
  }

  /** Each frame, before it's drawn: ease every lit item toward hovered/selected, then put the look on. */
  private light(): void {
    const now = performance.now();
    const ms = Math.min(now - this.last, 100);
    this.last = now;
    for (const [object, l] of this.lit) {
      const held = object === this.selected?.object;
      l.up = toward(l.up, held || object === this.hovered?.object ? 1 : 0, ms);
      l.held = toward(l.held, held ? 1 : 0, ms);
      if (l.up === 0 && l.held === 0) {
        disposeOutline(l);
        this.lit.delete(object);
        continue;
      }
      if (l.item.highlight || !isShown(object)) {
        if (l.outline) l.outline.visible = false;
        continue;
      }
      const e = ease(l.up);
      if (l.item.kind !== 'line') {
        const scale = object.scale.clone();
        object.scale.multiplyScalar(1 + LIFT * e);
        this.restore.push(() => object.scale.copy(scale));
      }
      const outlined = l.item.kind !== 'line' && l.held > 0;
      this.glow(object, e, outlined);
      if (outlined) this.outline(l, ease(l.held));
      else if (l.outline) l.outline.visible = false;
    }
  }

  /** Right after the frame is drawn: take the look off again, so the story only ever sees its own values. */
  private unlight(): void {
    for (let i = this.restore.length - 1; i >= 0; i--) this.restore[i]();
    this.restore.length = 0;
  }

  /**
   * Brighten every material under `object` in its own color. When it's
   * outlined, its pixels also mark the stencil, so the outline only shows
   * outside the item's silhouette (no edges drawn across the item itself).
   */
  private glow(object: Object3D, e: number, outlined: boolean): void {
    const seen = new Set<Material>();
    object.traverse((o) => {
      const own = (o as Mesh).material as Material | Material[] | undefined;
      if (!own) return;
      for (const m of Array.isArray(own) ? own : [own]) {
        if (seen.has(m) || !m.visible) continue;
        seen.add(m);
        if (outlined && isSolid(m)) {
          const { stencilWrite, stencilRef, stencilFunc, stencilZPass } = m;
          Object.assign(m, { stencilWrite: true, stencilRef: STENCIL, stencilFunc: AlwaysStencilFunc, stencilZPass: ReplaceStencilOp });
          this.restore.push(() => Object.assign(m, { stencilWrite, stencilRef, stencilFunc, stencilZPass }));
        }
        const lit = m as Material & { color?: Color; emissive?: Color; emissiveIntensity?: number };
        if (lit.emissive && lit.color && lit.emissiveIntensity !== undefined) {
          const emissive = lit.emissive.clone();
          const intensity = lit.emissiveIntensity;
          lit.emissive.multiplyScalar(intensity).add(lit.color.clone().multiplyScalar(GLOW * e));
          lit.emissiveIntensity = 1;
          this.restore.push(() => {
            lit.emissive!.copy(emissive);
            lit.emissiveIntensity = intensity;
          });
        } else if (lit.color) {
          const color = lit.color.clone();
          lit.color.multiplyScalar(1 + GLOW_FLAT * e);
          this.restore.push(() => lit.color!.copy(color));
        }
      }
    });
  }

  /** The selection outline: a slightly bigger copy of each part, inside out, in the item's own color. */
  private outline(l: Lit, e: number): void {
    const object = l.item.object;
    object.updateMatrixWorld(true);
    l.outline ??= buildOutline(object, this.stage);
    l.outline.visible = true;
    for (const shell of l.outline.children as Shell[]) {
      const { source, offset } = shell.userData;
      const material = source.material as Material;
      shell.visible = isShown(source);
      shell.matrix.multiplyMatrices(source.matrixWorld, offset);
      shell.matrixWorldNeedsUpdate = true;
      shell.layers.mask = source.layers.mask;
      shell.material.opacity = OUTLINE_OPACITY * e * (material.transparent ? material.opacity : 1);
    }
  }
}

/** An item being lit: how far into hover (`up`) and selection (`held`) it is, 0..1. */
interface Lit {
  item: Inspectable;
  up: number;
  held: number;
  outline?: Group;
}

type Shell = Mesh<Mesh['geometry'], MeshBasicMaterial> & { userData: { source: Mesh; offset: Matrix4 } };

/** Step `t` toward `target`: quick in, a little slower out. */
function toward(t: number, target: number, ms: number): number {
  return target > t ? Math.min(target, t + ms / EASE_IN_MS) : Math.max(target, t - ms / EASE_OUT_MS);
}

function ease(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * One shell per solid part, sized to that part's own mesh: grown about its
 * center by OUTLINE_WIDTH on every side, drawn back faces only and never over
 * the item's own pixels (stencil), so together they show only the rim around
 * the item's silhouette. Kept on the stage (not inside the item), placed
 * from the part's world matrix each frame.
 */
function buildOutline(object: Object3D, stage: Stage): Group {
  const color = tintOf(object);
  const group = new Group();
  const size = new Vector3();
  const center = new Vector3();
  const scale = new Vector3();
  object.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || (mesh as { isInstancedMesh?: boolean }).isInstancedMesh || Array.isArray(mesh.material)) return;
    const material = mesh.material as Material;
    if (!isSolid(material)) return;
    const geometry = mesh.geometry;
    geometry.boundingBox ?? geometry.computeBoundingBox();
    const box = geometry.boundingBox as Box3;
    box.getSize(size);
    box.getCenter(center);
    mesh.matrixWorld.decompose(new Vector3(), new Quaternion(), scale);
    size.multiply(scale);
    if (Math.max(size.x, size.y, size.z) < OUTLINE_MIN_PART) return;
    // Flat parts (a plane) grow only along the axes they have.
    const grow = (s: number) => (s > 1e-4 ? (s + 2 * OUTLINE_WIDTH) / s : 1);
    const k = new Vector3(grow(size.x), grow(size.y), grow(size.z));
    const offset = new Matrix4()
      .makeTranslation(center.x, center.y, center.z)
      .multiply(new Matrix4().makeScale(k.x, k.y, k.z))
      .multiply(new Matrix4().makeTranslation(-center.x, -center.y, -center.z));
    const shell = new Mesh(
      geometry,
      new MeshBasicMaterial({
        color,
        side: BackSide,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        stencilWrite: true,
        stencilRef: STENCIL,
        stencilFunc: NotEqualStencilFunc,
      }),
    ) as unknown as Shell;
    // After the item (and its glass), so its stencil is already down.
    shell.renderOrder = 10;
    shell.matrixAutoUpdate = false;
    shell.castShadow = false;
    shell.receiveShadow = false;
    shell.userData = { source: mesh, offset };
    group.add(shell);
  });
  stage.add(group);
  return group;
}

/** A solid surface, not a glow, sweep or fading ghost: only these shape the silhouette. */
function isSolid(m: Material): boolean {
  return m.visible && m.depthWrite && (!m.transparent || m.opacity >= 0.5);
}

function disposeOutline(l: Lit): void {
  if (!l.outline) return;
  l.outline.removeFromParent();
  for (const shell of l.outline.children as Shell[]) shell.material.dispose();
  l.outline = undefined;
}

/** The item's own color: its lineage if it has one, else the most colorful thing on it. */
function tintOf(object: Object3D): Color {
  const lineage = (object as { lineage?: Lineage }).lineage;
  if (lineage && LINEAGE[lineage]) return LINEAGE[lineage].clone();
  let best: Color | null = null;
  let most = 0.15;
  const hsl = { h: 0, s: 0, l: 0 };
  object.traverse((o) => {
    const own = (o as Mesh).material as Material | Material[] | undefined;
    if (!own) return;
    for (const m of Array.isArray(own) ? own : [own]) {
      const color = (m as { color?: Color }).color;
      if (!color || !m.visible) continue;
      color.getHSL(hsl);
      const colorful = hsl.l > 0.15 && hsl.l < 0.85 ? hsl.s : 0;
      if (colorful > most) {
        most = colorful;
        best = color;
      }
    }
  });
  return best ? (best as Color).clone() : LINEAGE.cyan.clone();
}

/** A fat invisible tube along a thin line, so the pointer can find it. */
export function lineHit(curve: Curve<Vector3>, radius = 0.16): Mesh {
  const tube = new Mesh(
    new TubeGeometry(curve, Math.max(8, Math.ceil(curve.getLength() * 6)), radius, 6),
    new MeshBasicMaterial({ visible: false }),
  );
  return tube;
}

/** Is it on the grid right now (it and everything above it visible)? */
function isShown(o: Object3D): boolean {
  for (let p: Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}
