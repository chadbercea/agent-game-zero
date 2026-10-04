import {
  NeutralToneMapping,
  DirectionalLight,
  HemisphereLight,
  type Intersection,
  Mesh,
  MeshBasicMaterial,
  MOUSE,
  type Object3D,
  OrthographicCamera,
  VSMShadowMap,
  PlaneGeometry,
  PMREMGenerator,
  Raycaster,
  Timer,
  Scene,
  ShadowMaterial,
  SRGBColorSpace,
  TOUCH,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { NEUTRAL } from '../core/palette';

export type TickFn = (dt: number, elapsed: number) => void;

export interface StageOptions {
  /** World units visible vertically at zoom 1. */
  viewSize?: number;
  /** Allow pan + zoom. Specimens can lock the camera. */
  interactive?: boolean;
}

/** True isometric direction: equal x/y/z, camera looks down ~35.26°. */
const ISO_DIRECTION = new Vector3(1, 1, 1).normalize();
const CAMERA_DISTANCE = 50;
/** Render layer for objects kept at full opacity in Detail. */
const DETAIL_LAYER = 1;
/** Opacity of everything outside the focused lineage. */
const DETAIL_OPACITY = 0.1;
const DETAIL_EASE = 7;

/**
 * The white isometric world: renderer, fixed-angle orthographic camera with
 * pan + zoom (never rotation), studio lighting, shadow-catching floor, glow,
 * and world-space labels. Everything else is composed on top of it.
 */
export class Stage {
  readonly scene = new Scene();
  readonly camera: OrthographicCamera;
  readonly renderer: WebGLRenderer;
  readonly controls: OrbitControls;

  private readonly container: HTMLElement;
  private readonly labels = new CSS2DRenderer();
  private readonly timer = new Timer();
  private readonly ticks = new Set<TickFn>();
  private readonly resizeObserver: ResizeObserver;
  private readonly raycaster = new Raycaster();
  private readonly viewSize: number;

  // Detail view: a white veil over the scene, with the focused objects redrawn on top.
  private detailProvider: (() => Object3D[]) | null = null;
  private detailAmount = 0;
  private detailMembers: Object3D[] = [];
  private readonly veilScene = new Scene();
  private readonly veilCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly veilMaterial = new MeshBasicMaterial({
    color: NEUTRAL.backdrop,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });

  constructor(container: HTMLElement, options: StageOptions = {}) {
    const { viewSize = 12, interactive = true } = options;
    this.container = container;
    this.viewSize = viewSize;

    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    container.style.overflow = 'hidden';

    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = VSMShadowMap;
    this.renderer.domElement.style.display = 'block';
    container.appendChild(this.renderer.domElement);

    this.labels.domElement.style.position = 'absolute';
    this.labels.domElement.style.inset = '0';
    this.labels.domElement.style.pointerEvents = 'none';
    container.appendChild(this.labels.domElement);

    // Rendered straight to the canvas (no post chain): tone mapping applies to
    // materials only, so the cleared backdrop stays exactly white.
    this.scene.background = NEUTRAL.backdrop;

    this.camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    this.camera.position.copy(ISO_DIRECTION).multiplyScalar(CAMERA_DISTANCE);
    this.camera.lookAt(0, 0, 0);

    this.addLighting();
    this.addFloor();

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableRotate = false;
    this.controls.screenSpacePanning = false; // pan across the floor plane
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.minZoom = 0.25;
    this.controls.maxZoom = 6;
    this.controls.mouseButtons = { LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN };
    this.controls.touches = { ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_PAN };
    this.controls.enabled = interactive;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    this.veilScene.add(new Mesh(new PlaneGeometry(2, 2), this.veilMaterial));

    this.renderer.setAnimationLoop(() => this.loop());
  }

  /**
   * Enter Detail: objects returned by `provider` (re-evaluated every frame, so
   * new packets join) stay at full opacity; everything else fades to 10%.
   * Pass null to return to Runtime.
   */
  setDetail(provider: (() => Object3D[]) | null): void {
    this.detailProvider = provider;
  }

  get inDetail(): boolean {
    return this.detailProvider !== null;
  }

  /** Register a per-frame callback. Returns an unsubscribe function. */
  onTick(fn: TickFn): () => void {
    this.ticks.add(fn);
    return () => this.ticks.delete(fn);
  }

  add(...objects: Object3D[]): void {
    this.scene.add(...objects);
  }

  remove(...objects: Object3D[]): void {
    this.scene.remove(...objects);
  }

  /** Raycast from a pointer position (client coords) against the given objects. */
  pick(clientX: number, clientY: number, targets: Object3D[]): Intersection | undefined {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.intersectObjects(targets, true)[0];
  }

  /** Pan the camera so `point` sits at the center of the view. */
  centerOn(point: Vector3): void {
    const offset = this.camera.position.clone().sub(this.controls.target);
    this.controls.target.copy(point);
    this.camera.position.copy(point).add(offset);
  }

  private loop(): void {
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 1 / 20);
    const elapsed = this.timer.getElapsed();
    for (const tick of this.ticks) tick(dt, elapsed);
    this.controls.update();

    const target = this.detailProvider ? 1 : 0;
    this.detailAmount += (target - this.detailAmount) * (1 - Math.exp(-DETAIL_EASE * dt));
    if (!this.detailProvider && this.detailAmount < 0.002) {
      if (this.detailMembers.length > 0) this.setDetailMembers([]);
      this.detailAmount = 0;
      this.renderer.render(this.scene, this.camera);
    } else {
      if (this.detailProvider) this.setDetailMembers(this.detailProvider());
      this.renderDetail();
    }
    this.labels.render(this.scene, this.camera);
  }

  /** Scene → veil (fades everything to 10%) → focused objects redrawn on top. */
  private renderDetail(): void {
    const { renderer, scene, camera } = this;
    renderer.render(scene, camera);
    this.veilMaterial.opacity = (1 - DETAIL_OPACITY) * this.detailAmount;
    renderer.autoClear = false;
    renderer.render(this.veilScene, this.veilCamera);
    renderer.clearDepth();
    const background = scene.background;
    scene.background = null;
    camera.layers.set(DETAIL_LAYER);
    renderer.render(scene, camera);
    camera.layers.set(0);
    scene.background = background;
    renderer.autoClear = true;

    const fade = String(1 - (1 - DETAIL_OPACITY) * this.detailAmount);
    this.forEachLabel((label) => {
      label.element.style.opacity = label.layers.isEnabled(DETAIL_LAYER) ? '1' : fade;
    });
  }

  private setDetailMembers(roots: Object3D[]): void {
    for (const o of this.detailMembers) o.layers.disable(DETAIL_LAYER);
    const members: Object3D[] = [];
    for (const root of roots) root.traverse((o) => members.push(o));
    for (const o of members) o.layers.enable(DETAIL_LAYER);
    this.detailMembers = members;
    if (members.length === 0) this.forEachLabel((label) => (label.element.style.opacity = '1'));
  }

  private forEachLabel(fn: (label: CSS2DObject) => void): void {
    this.scene.traverse((o) => {
      if (o instanceof CSS2DObject) fn(o);
    });
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.timer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labels.domElement.remove();
    this.ticks.clear();
  }

  private addLighting(): void {
    const pmrem = new PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;
    pmrem.dispose();

    const hemi = new HemisphereLight(0xffffff, 0xc9ccd4, 0.7);
    this.scene.add(hemi);

    // Overhead key from camera-left so facets step from lit to shaded across the body.
    const key = new DirectionalLight(0xffffff, 2.4);
    key.position.set(-2, 18, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.radius = 14;
    key.shadow.blurSamples = 20;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    const s = 24;
    Object.assign(key.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 60 });
    this.scene.add(key, key.target);

    const fill = new DirectionalLight(0xffffff, 0.35);
    fill.position.set(12, 4, -2);
    this.scene.add(fill);

    // Lights also illuminate the Detail pass.
    for (const light of [hemi, key, fill]) light.layers.enable(DETAIL_LAYER);
  }

  private addFloor(): void {
    const floor = new Mesh(new PlaneGeometry(400, 400), new ShadowMaterial({ opacity: 0.08 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.name = 'floor';
    // Catches the focused lineage's shadows above the veil.
    floor.layers.enable(DETAIL_LAYER);
    this.scene.add(floor);
  }

  private resize(): void {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    const aspect = width / height;
    const half = this.viewSize / 2;
    Object.assign(this.camera, { left: -half * aspect, right: half * aspect, top: half, bottom: -half });
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.labels.setSize(width, height);
  }
}
