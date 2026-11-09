import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import type { Point } from '../data/types';
import { TERRAIN_EXTENT, elevationLabel } from '../data/terrain';
import { toWorld, type Cam, type Size } from '../lib/camera';

/** Anything the pointer can be over that is not bare terrain. */
const NOT_TERRAIN = 'button, a, input, select, textarea, .lm, .stop, .callout, .map-controls, .legend, .diagram-callout, .diagram-backdrop';
/** Below this the label flips to the other side of the cursor. */
const FLIP_X = 120;
const FLIP_Y = 56;

/**
 * A surveyor's spot height under the cursor: the elevation of the terrain at the
 * pointer, rounded the way the map prints it. Mouse and pen only.
 *
 * Pointer moves never re-render React: they are coalesced into one frame and the
 * label is written straight to the DOM. A camera move (fly, wheel zoom) re-renders
 * only this component, so the reading follows the ground sliding under a still cursor.
 */
export function ElevationProbe({ host, cam, stage }: { host: RefObject<HTMLElement | null>; cam: Cam; stage: Size }) {
  const box = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  const s = useRef({ cam, stage, p: null as Point | null, raf: 0, shown: '', side: '' });

  const draw = () => {
    s.current.raf = 0;
    const el = box.current;
    const label = text.current;
    const { cam, stage, p } = s.current;
    if (!el || !label) return;
    const w = p && toWorld(cam, stage, p);
    const on =
      w && w.x > TERRAIN_EXTENT.x0 && w.x < TERRAIN_EXTENT.x1 && w.y > TERRAIN_EXTENT.y0 && w.y < TERRAIN_EXTENT.y1;
    if (!p || !w || !on) {
      el.classList.remove('is-on');
      return;
    }
    const t = elevationLabel(w.x, w.y);
    if (t !== s.current.shown) {
      label.textContent = t;
      s.current.shown = t;
    }
    const side = `${p.x > stage.w - FLIP_X ? 'w' : 'e'}${p.y > stage.h - FLIP_Y ? 'n' : 's'}`;
    if (side !== s.current.side) {
      el.dataset.side = side;
      s.current.side = side;
    }
    el.style.transform = `translate3d(${Math.round(p.x)}px, ${Math.round(p.y)}px, 0)`;
    el.classList.add('is-on');
  };
  const schedule = () => {
    if (!s.current.raf) s.current.raf = requestAnimationFrame(draw);
  };

  // Camera moved under a resting cursor: re-read the ground.
  useLayoutEffect(() => {
    s.current.cam = cam;
    s.current.stage = stage;
    if (s.current.p) schedule();
  });

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    const hide = () => {
      s.current.p = null;
      schedule();
    };
    const onMove = (e: PointerEvent) => {
      // Touch never hovers; a pressed button means a drag is panning the map.
      if (e.pointerType === 'touch' || !fine.matches || e.buttons !== 0 || (e.target as Element).closest(NOT_TERRAIN)) {
        hide();
        return;
      }
      const r = node.getBoundingClientRect();
      s.current.p = { x: e.clientX - r.left, y: e.clientY - r.top };
      schedule();
    };
    node.addEventListener('pointermove', onMove);
    node.addEventListener('pointerdown', hide);
    node.addEventListener('pointerleave', hide);
    const st = s.current;
    return () => {
      node.removeEventListener('pointermove', onMove);
      node.removeEventListener('pointerdown', hide);
      node.removeEventListener('pointerleave', hide);
      cancelAnimationFrame(st.raf);
      st.raf = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host]);

  return (
    <div ref={box} className="probe" data-side="es" aria-hidden="true">
      <span className="probe__tick" />
      <span className="probe__lead" />
      <span ref={text} className="probe__label" />
    </div>
  );
}
