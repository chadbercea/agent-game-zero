import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

/** A dark name tag that floats over a 3D object (drone names, ticket keys). */
export function makeLabel(text: string): CSS2DObject {
  const el = document.createElement('div');
  el.textContent = text;
  Object.assign(el.style, {
    font: '500 12px/1 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
    letterSpacing: '0.02em',
    color: '#fff',
    background: 'rgba(28,29,33,0.92)',
    padding: '5px 9px',
    borderRadius: '6px',
    whiteSpace: 'nowrap',
    userSelect: 'none',
  } satisfies Partial<CSSStyleDeclaration>);
  return new CSS2DObject(el);
}
