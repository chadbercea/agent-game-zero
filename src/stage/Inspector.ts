import {
  Box3,
  type Curve,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  RingGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import { LINEAGE } from '../core/palette';
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
  /** Light it up on hover, if a floor ring under it isn't right (a line brightens itself). */
  highlight?: (on: boolean) => void;
}

/** Seconds between refreshes of an open panel, so its numbers move while you look. */
const REFRESH_MS = 300;
/** Pointer travel (px) that still counts as a click, not a drag of the camera. */
const CLICK_SLOP = 5;
const HIGHLIGHT = LINEAGE.cyan;

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
 * Inspect anything on the grid (ILI-970): hovering an item highlights it
 * (nothing else); clicking it opens its card in the panel on the right.
 * Clicking another item swaps the panel to it; clicking empty floor, the ×,
 * or Escape deselects and the panel goes away. One mechanism for the whole
 * story: hand it the items (`items` is read on every pointer move, so it
 * follows what's on the grid now). Returns the inspector; `dispose()`
 * detaches it.
 */
export class Inspector {
  readonly panel: InspectPanel;
  hovered: Inspectable | null = null;
  selected: Inspectable | null = null;
  private readonly ring: Mesh<RingGeometry, MeshBasicMaterial>;
  private refresh: ReturnType<typeof setInterval> | undefined;
  private down: { x: number; y: number } | null = null;
  private readonly detach: () => void;

  constructor(
    private readonly stage: Stage,
    private readonly items: () => Inspectable[],
    parent?: HTMLElement,
  ) {
    this.panel = new InspectPanel(() => this.select(null), parent);
    this.ring = new Mesh(
      new RingGeometry(0.92, 1, 48),
      new MeshBasicMaterial({ color: HIGHLIGHT, transparent: true, opacity: 0.85, depthWrite: false, side: DoubleSide }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.renderOrder = 2;
    this.ring.visible = false;
    stage.add(this.ring);

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
    this.detach = () => {
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
    };
  }

  /** Highlight `item` (or nothing). Hover never opens the panel. */
  hover(item: Inspectable | null): void {
    if (item === this.hovered) return;
    this.light(this.hovered, false);
    this.hovered = item;
    this.light(item, true);
    this.stage.renderer.domElement.style.cursor = item ? 'pointer' : '';
  }

  /** Open `item`'s card in the panel (swapping from whatever was open), or close it with null. */
  select(item: Inspectable | null): void {
    this.selected = item;
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
    this.light(this.hovered, false);
    this.panel.dispose();
    this.ring.removeFromParent();
    this.ring.geometry.dispose();
    this.ring.material.dispose();
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

  /** The highlight: the item's own, or a ring on the floor around its footprint. */
  private light(item: Inspectable | null, on: boolean): void {
    if (!item) {
      if (!on) this.ring.visible = false;
      return;
    }
    if (item.highlight) return item.highlight(on);
    this.ring.visible = on;
    if (!on) return;
    const box = new Box3().setFromObject(item.object);
    const center = box.getCenter(new Vector3());
    const size = box.getSize(new Vector3());
    this.ring.position.set(center.x, 0.02, center.z);
    this.ring.scale.setScalar(Math.max(0.45, Math.hypot(size.x, size.z) * 0.5));
  }
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
