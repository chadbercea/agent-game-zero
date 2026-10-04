import { CanvasTexture, SRGBColorSpace, type Texture } from 'three';

let radialCache: Texture | undefined;

/** White radial falloff for glows and hazes; tint it via material color. */
export function radialGlowTexture(): Texture {
  if (radialCache) return radialCache;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  radialCache = new CanvasTexture(canvas);
  radialCache.colorSpace = SRGBColorSpace;
  return radialCache;
}
