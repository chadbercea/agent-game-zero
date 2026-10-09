import { Group, type Material, Mesh, MeshStandardMaterial } from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { FACE_CAMERA, NODE_FOOTPRINT } from '../../core/grid';
import { NEUTRAL, STATUS_COLOR, type Status } from '../../core/palette';
import { Pad } from '../pad/Pad';
import { buildEmblem, SYSTEM_NAME, type SystemKind } from './emblems';

/** Nodes are smaller than gates; a sub-agent floats over them. */
export const NODE_SCALE = 0.72;
/** How faint a fully dimmed node is: there, but out of reach. */
const DIM_OPACITY = 0.28;
/** Height of the emblem's center, low enough to sit under a hovering sub-agent. */
export const EMBLEM_HEIGHT = 0.62;
/** Emblems are modeled ~0.5 tall; shown a little larger so the system reads at map scale. */
export const EMBLEM_SCALE = 1.5;

/** A node's light: off (gray) until a sub-agent works it, then that sub-agent's status. */
export type NodeLight = 'off' | Status;

export interface SystemNodeOptions {
  kind: SystemKind;
  showLabel?: boolean;
}

/**
 * System node primitive: one system behind a gate (Figma, GitHub, Notion).
 * A small Pad whose screen shows the node's light, a floating emblem that
 * says which system it is, and a name label. The pad sits square on the
 * grid (2 × 2 cells, never rotated); the emblem and label face the camera.
 */
export class SystemNode extends Group {
  readonly kind: SystemKind;
  readonly pad = new Pad({ width: NODE_FOOTPRINT / NODE_SCALE, depth: NODE_FOOTPRINT / NODE_SCALE });
  /** Floating emblem; animators bob and turn it. */
  readonly emblem: Group;
  private _light: NodeLight = 'off';
  private _dim = 0;
  /** Every material in the node (pad and emblem) and its own opacity, for dimming. */
  private dimmable?: { material: Material; opacity: number; transparent: boolean; depthWrite: boolean }[];
  private readonly materials: Material[];
  private readonly label?: CSS2DObject;

  constructor(options: SystemNodeOptions) {
    super();
    this.kind = options.kind;
    this.name = `node:${options.kind}`;
    this.pad.scale.setScalar(NODE_SCALE);
    this.add(this.pad);

    const shell = new MeshStandardMaterial({ color: NEUTRAL.shell, roughness: 0.4, flatShading: true });
    const graphite = new MeshStandardMaterial({ color: NEUTRAL.graphite, roughness: 0.45, metalness: 0.2, flatShading: true });
    this.materials = [shell, graphite];
    this.emblem = buildEmblem(options.kind, { shell, graphite });
    this.emblem.position.y = EMBLEM_HEIGHT;
    this.emblem.scale.setScalar(EMBLEM_SCALE);
    this.emblem.rotation.y = FACE_CAMERA;
    this.add(this.emblem);

    if (options.showLabel ?? true) {
      const el = document.createElement('div');
      el.textContent = SYSTEM_NAME[options.kind];
      Object.assign(el.style, {
        font: '500 11px/1 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
        letterSpacing: '0.04em',
        color: '#5b5e66',
        whiteSpace: 'nowrap',
        userSelect: 'none',
      } satisfies Partial<CSSStyleDeclaration>);
      this.label = new CSS2DObject(el);
      // Just past the pad's front corner, straight below it on screen.
      const front = NODE_FOOTPRINT * 0.62;
      this.label.position.set(Math.sin(FACE_CAMERA) * front, -0.05, Math.cos(FACE_CAMERA) * front);
      this.add(this.label);
    }

    this.applyLight();
  }

  get light(): NodeLight {
    return this._light;
  }

  set light(value: NodeLight) {
    if (value === this._light) return;
    this._light = value;
    this.applyLight();
  }

  /**
   * How far out of reach the node looks (0 = itself, 1 = a faint ghost):
   * pad, emblem and label fade together. For systems an agent can't reach.
   */
  get dim(): number {
    return this._dim;
  }

  set dim(value: number) {
    this._dim = Math.min(1, Math.max(0, value));
    this.dimmable ??= this.collectMaterials();
    const keep = 1 - this._dim * (1 - DIM_OPACITY);
    for (const d of this.dimmable) {
      d.material.transparent = d.transparent || this._dim > 0;
      d.material.opacity = d.opacity * keep;
      // A ghost doesn't hide what's behind it.
      d.material.depthWrite = this._dim > 0 ? false : d.depthWrite;
    }
    if (this.label) this.label.element.style.opacity = String(keep);
  }

  /** How much of the name label shows (0–1), apart from `dim`: a node growing in or folding away takes its name with it. */
  get labelOpacity(): number {
    return this.label ? Number(this.label.element.style.opacity || 1) : 0;
  }

  set labelOpacity(value: number) {
    if (this.label) this.label.element.style.opacity = String(Math.min(1, Math.max(0, value)));
  }

  private collectMaterials() {
    const seen = new Map<Material, { opacity: number; transparent: boolean; depthWrite: boolean }>();
    this.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (!seen.has(m)) seen.set(m, { opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite });
      }
    });
    return [...seen].map(([material, base]) => ({ material, ...base }));
  }

  dispose(): void {
    this.removeFromParent();
    this.pad.dispose();
    this.label?.element.remove();
    this.emblem.traverse((o) => {
      if (o instanceof Mesh) o.geometry.dispose();
    });
    for (const m of this.materials) m.dispose();
  }

  private applyLight(): void {
    const off = this._light === 'off';
    this.pad.setColor(off ? NEUTRAL.offLight : STATUS_COLOR[this._light as Status]);
    this.pad.glowMaterial.visible = !off;
  }
}
