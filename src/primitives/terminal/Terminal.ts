import { CanvasTexture, Group, type Material, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { NODE_FOOTPRINT } from '../../core/grid';
import { solid } from '../../core/mesh';
import { NEUTRAL, STATUS_COLOR } from '../../core/palette';
import { seededRandom } from '../../core/scatter';

/**
 * Terminal states. Off = a dark screen. Admin = a prompt and a few config
 * lines typing in (setting up). Tail = log lines scrolling (CI/CD, live
 * logs); `pass()` flashes it green. Diff = code being written: green added
 * and red removed rows beside a gutter (also how code review looks).
 */
export type TerminalState = 'off' | 'admin' | 'tail' | 'diff';
export const TERMINAL_STATES: readonly TerminalState[] = ['off', 'admin', 'tail', 'diff'];

/** The slab is a node's footprint (2 × 2 cells), and thin: it lies flat, level with the lines. */
export const TERMINAL_SIZE = NODE_FOOTPRINT;
export const TERMINAL_HEIGHT = 0.06;
const SCREEN = TERMINAL_SIZE - 0.14;
const PX = 256;
const ROW = 24;
const ROWS = 9;
const BAR = 11;
const LEFT = 18;
const TYPE_SPEED = 1.6;
const SCROLL_SPEED = 2.4;
const DIFF_SPEED = 2.2;
const PASS_SECONDS = 1.2;

const css = (c: { getStyle: () => string }) => c.getStyle();
const INK = css(NEUTRAL.shellShade);
const INK_DIM = css(NEUTRAL.offLight);
const BG = '#17181c';
const GUTTER = '#202127';
const GREEN = css(STATUS_COLOR.working);
const RED = css(STATUS_COLOR.stopped);

interface Row {
  width: number;
  kind: 'plain' | 'add' | 'remove' | 'prompt';
  indent: number;
}

/**
 * Terminal primitive: where code work shows. A thin white slab lying flat on
 * the grid, square (a node's footprint, never rotated), with a dark screen
 * face up, level with the lines that plug into its edges. Its screen is drawn
 * live (abstract rows, not text); see TerminalState. Call `update(dt)` each frame.
 */
export class Terminal extends Group {
  readonly screenMaterial: MeshBasicMaterial;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: CanvasTexture;
  private readonly materials: Material[];
  private readonly random: () => number;
  private _state: TerminalState = 'off';
  private rows: Row[] = [];
  /** How far the current state has run (rows typed / scrolled / written). */
  private clock = 0;
  private passLeft = 0;
  private _passed = false;

  constructor(options: { state?: TerminalState; seed?: number } = {}) {
    super();
    this.random = seededRandom(options.seed ?? 1);
    const shell = new MeshStandardMaterial({ color: NEUTRAL.shell, roughness: 0.5 });
    this.add(solid(new RoundedBoxGeometry(TERMINAL_SIZE, TERMINAL_HEIGHT, TERMINAL_SIZE, 2, 0.025), shell)).position.y = TERMINAL_HEIGHT / 2;

    this.canvas = document.createElement('canvas');
    this.canvas.width = PX;
    this.canvas.height = PX;
    this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.screenMaterial = new MeshBasicMaterial({ map: this.texture });
    const screenGeometry = new PlaneGeometry(SCREEN, SCREEN);
    screenGeometry.rotateX(-Math.PI / 2);
    const screen = solid(screenGeometry, this.screenMaterial);
    screen.castShadow = false;
    screen.position.y = TERMINAL_HEIGHT + 0.002;
    this.add(screen);
    this.materials = [shell, this.screenMaterial];
    this.state = options.state ?? 'off';
  }

  get state(): TerminalState {
    return this._state;
  }

  set state(value: TerminalState) {
    this._state = value;
    this.clock = 0;
    this._passed = false;
    this.rows = value === 'off' ? [] : this.makeRows(value);
    this.draw();
  }

  /** CI passed: the screen flashes green and stays marked passed until the state changes. */
  pass(): void {
    this._passed = true;
    this.passLeft = PASS_SECONDS;
    this.draw();
  }

  get passed(): boolean {
    return this._passed;
  }

  /** Diff rows written so far (0 until the diff state starts writing). */
  get written(): number {
    return this._state === 'diff' ? Math.min(this.rows.length, Math.floor(this.clock * DIFF_SPEED)) : 0;
  }

  update(dt: number): void {
    if (this._state === 'off' && this.passLeft <= 0) return;
    this.clock += dt;
    this.passLeft = Math.max(0, this.passLeft - dt);
    this.draw();
  }

  dispose(): void {
    this.removeFromParent();
    this.texture.dispose();
    for (const m of this.materials) m.dispose();
  }

  private makeRows(state: TerminalState): Row[] {
    const r = this.random;
    if (state === 'admin') {
      return Array.from({ length: 5 }, (_, i) => ({ kind: i % 2 === 0 ? 'prompt' : 'plain', width: 0.25 + r() * 0.45, indent: i % 2 }));
    }
    if (state === 'tail') return Array.from({ length: 40 }, () => this.logRow());
    return Array.from({ length: ROWS - 1 }, () => {
      const p = r();
      return { kind: p < 0.35 ? 'add' : p < 0.55 ? 'remove' : 'plain', width: 0.2 + r() * 0.55, indent: Math.floor(r() * 3) };
    });
  }

  private logRow(): Row {
    return { kind: 'plain', width: 0.2 + this.random() * 0.7, indent: 0 };
  }

  private draw(): void {
    const { ctx } = this;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, PX, PX);
    if (this._state === 'admin') this.drawAdmin();
    else if (this._state === 'tail') this.drawTail();
    else if (this._state === 'diff') this.drawDiff();
    if (this.passLeft > 0 || this._passed) {
      const flash = this.passLeft / PASS_SECONDS;
      ctx.globalAlpha = 0.12 + 0.35 * flash;
      ctx.fillStyle = GREEN;
      ctx.fillRect(0, 0, PX, PX);
      ctx.globalAlpha = 1;
      ctx.fillRect(LEFT, PX - ROW * 1.4, PX * 0.35, BAR);
    }
    this.texture.needsUpdate = true;
  }

  private bar(x: number, y: number, width: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, width, BAR);
  }

  /** A prompt chevron and config lines, typed in one after another, then a blinking cursor. */
  private drawAdmin(): void {
    const typed = this.clock * TYPE_SPEED;
    this.rows.forEach((row, i) => {
      const t = Math.min(1, Math.max(0, typed - i));
      if (t <= 0) return;
      const y = 14 + i * ROW;
      let x = LEFT + row.indent * 14;
      if (row.kind === 'prompt') {
        this.bar(LEFT, y, 12, INK);
        x = LEFT + 20;
      }
      this.bar(x, y, (PX - 2 * LEFT) * row.width * t, row.kind === 'prompt' ? INK : INK_DIM);
    });
    const done = typed >= this.rows.length;
    if (done && Math.floor(this.clock * 2) % 2 === 0) this.bar(LEFT, 14 + this.rows.length * ROW, 10, INK);
  }

  /** Log lines scrolling up from the bottom; the newest line is the brightest. */
  private drawTail(): void {
    const scrolled = this.clock * SCROLL_SPEED;
    const first = Math.floor(scrolled);
    const offset = (scrolled - first) * ROW;
    while (this.rows.length < first + ROWS + 1) this.rows.push(this.logRow());
    for (let i = 0; i < ROWS; i++) {
      const row = this.rows[first + i];
      const y = PX - 22 - (ROWS - 1 - i) * ROW - offset;
      if (y < 4) continue;
      this.bar(LEFT, y, (PX - 2 * LEFT) * row.width, i === ROWS - 1 ? INK : INK_DIM);
    }
  }

  /** A gutter of line numbers, and rows written in one by one: added (green), removed (red), unchanged. */
  private drawDiff(): void {
    const { ctx } = this;
    ctx.fillStyle = GUTTER;
    ctx.fillRect(0, 0, 36, PX);
    const shown = this.written;
    for (let i = 0; i < shown; i++) {
      const row = this.rows[i];
      const y = 14 + i * ROW;
      this.bar(9, y, 18, INK_DIM);
      if (row.kind !== 'plain') {
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = row.kind === 'add' ? GREEN : RED;
        ctx.fillRect(36, y - 6, PX - 36, ROW - 2);
        ctx.globalAlpha = 1;
      }
      const color = row.kind === 'add' ? GREEN : row.kind === 'remove' ? RED : INK_DIM;
      if (row.kind !== 'plain') this.bar(42, y, 9, color);
      this.bar(58 + row.indent * 14, y, (PX - 80) * row.width, color);
    }
  }
}
