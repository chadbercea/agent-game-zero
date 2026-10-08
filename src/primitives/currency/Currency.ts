import {
  CanvasTexture,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
  type Texture,
  TorusGeometry,
} from 'three';
import { FACE_CAMERA } from '../../core/grid';

/** The ten denominations a cube can come out as (ILI-975): major currencies, each with its clearest mark. */
export const DENOMINATIONS = [
  { code: 'USD', symbol: '$' },
  { code: 'EUR', symbol: '€' },
  { code: 'JPY', symbol: '¥' },
  { code: 'GBP', symbol: '£' },
  { code: 'INR', symbol: '₹' },
  { code: 'AUD', symbol: 'A$' },
  { code: 'CAD', symbol: 'C$' },
  { code: 'CHF', symbol: 'Fr' },
  { code: 'KRW', symbol: '₩' },
  { code: 'BRL', symbol: 'R$' },
] as const;
export type CurrencyCode = (typeof DENOMINATIONS)[number]['code'];
export const CURRENCY_CODES: readonly CurrencyCode[] = DENOMINATIONS.map((d) => d.code);

/** A denomination from a seeded random generator: the same seed, the same money. */
export function pickCurrency(random: () => number): CurrencyCode {
  return CURRENCY_CODES[Math.min(CURRENCY_CODES.length - 1, Math.floor(random() * CURRENCY_CODES.length))];
}

/** Coins are a warm brass: money reads as money. Everything else in the scene stays white and graphite. */
const BRASS = '#e2bd5c';
const BRASS_DARK = '#9a7a26';
export const COIN_RADIUS = 0.2;
const COIN_THICKNESS = 0.06;

const faces = new Map<CurrencyCode, Texture>();

/** The coin's face for a currency: its mark struck in the middle of a brass disc with a fine inner ring. */
function face(code: CurrencyCode): Texture {
  const hit = faces.get(code);
  if (hit) return hit;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = BRASS;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = BRASS_DARK;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.4, 0, Math.PI * 2);
  ctx.stroke();
  const { symbol } = DENOMINATIONS.find((d) => d.code === code)!;
  ctx.fillStyle = BRASS_DARK;
  ctx.font = `700 ${symbol.length > 1 ? 104 : 150}px ui-sans-serif, system-ui, "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(symbol, size / 2, size / 2 + 8);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  // The disc stands on its edge, which turns its cap a quarter: turn the face back upright.
  texture.center.set(0.5, 0.5);
  texture.rotation = Math.PI / 2;
  faces.set(code, texture);
  return texture;
}

/**
 * Currency primitive: one coin of a major currency, standing on its edge to
 * face the camera so its mark reads: a brass disc with a raised rim, the
 * currency's symbol struck on both faces. `spin` turns it on its axis (the
 * owner animates it).
 */
export class Currency extends Group {
  readonly code: CurrencyCode;
  private readonly coin = new Group();
  private readonly materials: MeshStandardMaterial[];

  constructor(code: CurrencyCode) {
    super();
    this.code = code;
    const edge = new MeshStandardMaterial({ color: BRASS, metalness: 0.55, roughness: 0.35 });
    const faceMaterial = new MeshStandardMaterial({ map: face(code), metalness: 0.4, roughness: 0.4 });
    this.materials = [edge, faceMaterial];
    // CylinderGeometry's groups: 0 = side, 1 = top, 2 = bottom.
    const disc = new Mesh(new CylinderGeometry(COIN_RADIUS, COIN_RADIUS, COIN_THICKNESS, 40), [edge, faceMaterial, faceMaterial]);
    disc.rotation.x = Math.PI / 2;
    disc.castShadow = true;
    this.coin.add(disc);
    for (const side of [-1, 1]) {
      const rim = new Mesh(new TorusGeometry(COIN_RADIUS * 0.96, 0.012, 6, 40), edge);
      rim.position.z = (side * COIN_THICKNESS) / 2;
      this.coin.add(rim);
    }
    this.coin.rotation.y = FACE_CAMERA;
    this.add(this.coin);
  }

  /** Turn the coin about its upright axis, radians from facing the camera. */
  set spin(angle: number) {
    this.coin.rotation.y = FACE_CAMERA + angle;
  }

  dispose(): void {
    this.removeFromParent();
    for (const m of this.materials) m.dispose();
  }
}
