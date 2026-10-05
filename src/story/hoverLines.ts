import type { Stage } from '../stage/Stage';
import type { SystemMap } from './SystemMap';

/**
 * Lines on demand (project decision 3): hovering the gate or any node shows
 * the map's branches; clicking pins them on until the next click. Returns a
 * function that detaches the listeners.
 */
export function hoverLines(stage: Stage, map: SystemMap): () => void {
  const canvas = stage.renderer.domElement;
  let hovered = false;
  let pinned = false;
  const targets = () => [map.gate, ...map.nodes.filter((n) => n.visible)];
  const update = () => (map.linesVisible = map.revealed && (hovered || pinned));

  const onMove = (e: PointerEvent) => {
    hovered = Boolean(stage.pick(e.clientX, e.clientY, targets()));
    canvas.style.cursor = hovered ? 'pointer' : '';
    update();
  };
  let downAt = { x: 0, y: 0 };
  const onDown = (e: PointerEvent) => (downAt = { x: e.clientX, y: e.clientY });
  const onUp = (e: PointerEvent) => {
    if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 4) return; // a pan, not a click
    pinned = Boolean(stage.pick(e.clientX, e.clientY, targets())) && !pinned;
    update();
  };
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  return () => {
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointerup', onUp);
  };
}
