import { CanvasTexture, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { FACE_CAMERA } from '../../core/grid';
import { solid } from '../../core/mesh';
import { NEUTRAL, STATUS_COLOR } from '../../core/palette';

const W = 0.46;
const H = 0.84;
const D = 0.06;
const PX = 128;
/** How high the phone stands off the floor, on its little stand. */
const LIFT = 0.12;

/**
 * Phone primitive: the on-call person's own device, registered with
 * PagerDuty. A white handset standing up on a small graphite stand, facing
 * the camera, its screen dark at rest. `page()` lights the screen red and
 * shakes the phone (it's buzzing: something is down); `ack()` turns the
 * screen green (the person has it) and stops the buzz; `rest()` darkens it.
 * Call `update(dt)` each frame.
 */
export class Phone extends Group {
  readonly label: CSS2DObject;
  private readonly body = new Group();
  private readonly canvas = document.createElement('canvas');
  private readonly texture: CanvasTexture;
  private readonly screen: MeshBasicMaterial;
  private readonly materials: (MeshStandardMaterial | MeshBasicMaterial)[];
  private state: 'rest' | 'paged' | 'acked' = 'rest';
  private clock = 0;

  constructor(name = "On-call's phone") {
    super();
    const shell = new MeshStandardMaterial({ color: NEUTRAL.shell, roughness: 0.4, flatShading: true });
    const graphite = new MeshStandardMaterial({ color: NEUTRAL.graphite, roughness: 0.5, flatShading: true });
    this.canvas.width = PX;
    this.canvas.height = Math.round((PX * H) / W);
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.screen = new MeshBasicMaterial({ map: this.texture });
    this.materials = [shell, graphite, this.screen];

    this.add(solid(new RoundedBoxGeometry(0.4, 0.06, 0.3, 2, 0.02), graphite)).position.y = 0.03;
    this.body.position.y = LIFT + H / 2;
    this.body.rotation.y = FACE_CAMERA;
    this.add(this.body);
    this.body.add(solid(new RoundedBoxGeometry(W, H, D, 2, 0.05), shell));
    const face = new Mesh(new PlaneGeometry(W - 0.06, H - 0.1), this.screen);
    face.position.z = D / 2 + 0.002;
    this.body.add(face);

    // Its name under it, the way a system node's sits.
    const el = document.createElement('div');
    el.textContent = name;
    Object.assign(el.style, {
      font: '500 11px/1 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
      letterSpacing: '0.04em',
      color: '#5b5e66',
      whiteSpace: 'nowrap',
      userSelect: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    this.label = new CSS2DObject(el);
    this.label.position.set(Math.sin(FACE_CAMERA) * 0.45, -0.05, Math.cos(FACE_CAMERA) * 0.45);
    this.add(this.label);
    this.draw();
  }

  /** PagerDuty pages: the screen goes red and the phone buzzes. */
  page(): void {
    this.state = 'paged';
    this.draw();
  }

  /** The person acks: the screen goes green and the buzzing stops. */
  ack(): void {
    this.state = 'acked';
    this.body.rotation.z = 0;
    this.draw();
  }

  /** Back to rest: the screen goes dark. */
  rest(): void {
    this.state = 'rest';
    this.body.rotation.z = 0;
    this.draw();
  }

  get paged(): boolean {
    return this.state === 'paged';
  }

  get acked(): boolean {
    return this.state === 'acked';
  }

  update(dt: number): void {
    this.clock += dt;
    // Buzzing: a quick small shake, in bursts.
    if (this.state === 'paged') this.body.rotation.z = Math.sin(this.clock * 60) * 0.06 * (Math.sin(this.clock * 6) > 0 ? 1 : 0);
  }

  dispose(): void {
    this.removeFromParent();
    this.label.element.remove();
    this.texture.dispose();
    for (const m of this.materials) m.dispose();
  }

  private draw(): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const { width: w, height: h } = this.canvas;
    ctx.fillStyle = '#17181c';
    ctx.fillRect(0, 0, w, h);
    if (this.state !== 'rest') {
      // A notification card across the screen, red for a page, green once acked.
      ctx.fillStyle = (this.state === 'paged' ? STATUS_COLOR.stopped : STATUS_COLOR.working).getStyle();
      ctx.fillRect(w * 0.1, h * 0.3, w * 0.8, h * 0.26);
      ctx.fillStyle = NEUTRAL.shellShade.getStyle();
      ctx.fillRect(w * 0.18, h * 0.36, w * 0.5, h * 0.035);
      ctx.fillRect(w * 0.18, h * 0.45, w * 0.36, h * 0.035);
    }
    this.texture.needsUpdate = true;
  }
}
