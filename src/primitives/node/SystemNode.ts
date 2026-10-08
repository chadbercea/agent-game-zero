import { CylinderGeometry, Group, type Material, Mesh, MeshStandardMaterial, TorusGeometry } from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { FACE_CAMERA, NODE_FOOTPRINT } from '../../core/grid';
import { LINEAGE, type Lineage, NEUTRAL, STATUS_COLOR, type Status } from '../../core/palette';
import { buildEmblem, SYSTEM_NAME, type SystemKind } from './emblems';

/** The puck's radius: it fills the node's 2 × 2-cell footprint. */
const PUCK_RADIUS = NODE_FOOTPRINT / 2;
const PUCK_HEIGHT = 0.14;
/** How bright the ring glows when the node is in use. */
const RING_GLOW = 1.5;
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
  /**
   * Make it a tertiary (ILI-974/982): a small puck off its tool, owned by one
   * agent, ringed in that agent's lineage color, with no emblem or label.
   */
  tertiaryOf?: Lineage;
}

/**
 * System node primitive: one tool in a system (a secondary node), in the
 * Puck look Chad chose (ILI-973/982): a round, low white puck filling the
 * node's 2 × 2-cell footprint, with a ring around its top that lights with
 * the node's state (off gray; the working agent's status otherwise), a
 * floating emblem that says which tool it is, and a name label. Round, so
 * it never reads as a gate (gates are square pads). As a tertiary
 * (`tertiaryOf`) it's the same puck without the emblem, its ring in the
 * owning agent's color; the owner scales it down.
 */
export class SystemNode extends Group {
  readonly kind: SystemKind;
  /** The puck: body and ring, scaled together (a tool rising out of the floor scales its height). */
  readonly base = new Group();
  /** The tertiary's owner, if it's a tertiary. */
  readonly owner: Lineage | null;
  private readonly ring: MeshStandardMaterial;
  /** Floating emblem; animators bob and turn it. */
  readonly emblem: Group;
  private _light: NodeLight = 'off';
  private _dim = 0;
  /** Every material in the node (puck and emblem) and its own opacity, for dimming. */
  private dimmable?: { material: Material; opacity: number; transparent: boolean; depthWrite: boolean }[];
  private readonly materials: Material[];
  private readonly label?: CSS2DObject;

  constructor(options: SystemNodeOptions) {
    super();
    this.kind = options.kind;
    this.name = `node:${options.kind}`;
    this.owner = options.tertiaryOf ?? null;

    const shell = new MeshStandardMaterial({ color: NEUTRAL.shell, roughness: 0.4, flatShading: true });
    const graphite = new MeshStandardMaterial({ color: NEUTRAL.graphite, roughness: 0.45, metalness: 0.2, flatShading: true });
    const body = new MeshStandardMaterial({ color: NEUTRAL.shell, roughness: 0.4 });
    this.ring = new MeshStandardMaterial({ color: NEUTRAL.offLight, emissive: NEUTRAL.offLight, emissiveIntensity: 0.2 });
    this.materials = [shell, graphite, body, this.ring];
    const puck = new Mesh(new CylinderGeometry(PUCK_RADIUS, PUCK_RADIUS * 1.06, PUCK_HEIGHT, 40), body);
    puck.position.y = PUCK_HEIGHT / 2;
    puck.castShadow = puck.receiveShadow = true;
    const ring = new Mesh(new TorusGeometry(PUCK_RADIUS, 0.035, 8, 48), this.ring);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = PUCK_HEIGHT + 0.005;
    this.base.add(puck, ring);
    this.add(this.base);
    this.emblem = buildEmblem(options.kind, { shell, graphite });
    this.emblem.position.y = EMBLEM_HEIGHT;
    this.emblem.scale.setScalar(EMBLEM_SCALE);
    this.emblem.rotation.y = FACE_CAMERA;
    this.add(this.emblem);
    // A tertiary is just its puck: the tool it belongs to says what it is.
    this.emblem.visible = !this.owner;

    if (!this.owner && (options.showLabel ?? true)) {
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
      // Just past the puck's front edge, straight below it on screen.
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
   * puck, emblem and label fade together. For systems an agent can't reach.
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
    this.base.traverse((o) => {
      if (o instanceof Mesh) o.geometry.dispose();
    });
    this.label?.element.remove();
    this.emblem.traverse((o) => {
      if (o instanceof Mesh) o.geometry.dispose();
    });
    for (const m of this.materials) m.dispose();
  }

  /**
   * The ring shows the state. A tool's ring is gray when nobody's on it and
   * takes the working agent's status color when someone is. A tertiary's ring
   * is always its owner's color, brighter and tinted toward the status while
   * its agent works it.
   */
  private applyLight(): void {
    const off = this._light === 'off';
    const status = off ? null : STATUS_COLOR[this._light as Status];
    if (this.owner) {
      this.ring.color.copy(LINEAGE[this.owner]);
      this.ring.emissive.copy(LINEAGE[this.owner]);
      if (status) this.ring.emissive.lerp(status, 0.35);
    } else {
      this.ring.color.copy(status ?? NEUTRAL.offLight);
      this.ring.emissive.copy(status ?? NEUTRAL.offLight);
    }
    this.ring.emissiveIntensity = off ? (this.owner ? 0.5 : 0.2) : RING_GLOW;
  }
}
