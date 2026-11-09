import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import type { Point } from '../data/types';
import { toWorld, type Cam, type Size } from './camera';

export type FreeCamera = {
  stage: Size;
  /** Narrow layout: the page scrolls, so one finger / plain wheel must keep scrolling it. */
  compact: boolean;
  getCam: () => Cam;
  /** Apply a free camera (already zoom-clamped by the caller's clampK). */
  apply: (c: Cam) => void;
  clampK: (k: number) => number;
  onHint: (message: string) => void;
  onDragChange: (dragging: boolean) => void;
  /** Stage point → world point on the ground, when the 3D model is showing (null: use the flat camera). */
  pick?: (p: Point) => Point | null;
};

const INTERACTIVE = 'button, a, input, select, textarea, .map-controls, .legend, .diagram-callout, .diagram-backdrop';
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * Pointer, wheel and touch gestures for the map stage.
 *
 * - Mouse / pen: drag to pan; wheel or trackpad pinch zooms at the cursor.
 * - Touch, wide layout: one finger pans, two fingers pan and pinch-zoom.
 * - Touch, narrow layout: one finger keeps scrolling the page; two fingers move the map.
 * - Narrow layout with a mouse: plain wheel scrolls the page; Ctrl/⌘ + wheel zooms.
 */
export function useMapGestures(el: RefObject<HTMLElement | null>, opts: FreeCamera) {
  const o = useRef(opts);
  useLayoutEffect(() => {
    o.current = opts;
  });

  useEffect(() => {
    const node = el.current;
    if (!node) return;

    const local = (x: number, y: number): Point => {
      const r = node.getBoundingClientRect();
      return { x: x - r.left, y: y - r.top };
    };

    let lastHint = -Infinity;
    const hint = (msg: string) => {
      const now = performance.now();
      if (now - lastHint < 2500) return;
      lastHint = now;
      o.current.onHint(msg);
    };

    /** Where a stage point lands: on the model's ground when it shows, else through the flat camera. */
    const ground = (p: Point): Point => o.current.pick?.(p) ?? toWorld(o.current.getCam(), o.current.stage, p);
    /** Move the camera so `from` (a world point) lands where `to` is now, at scale k. */
    const carry = (from: Point, to: Point, k: number) => {
      const c = o.current.getCam();
      const f = c.k / k;
      o.current.apply({ k, cx: from.x + (c.cx - to.x) * f, cy: from.y + (c.cy - to.y) * f });
    };

    /* ----- drag to pan (pointer events) ----- */
    let drag: { id: number; start: Point; last: Point; moved: boolean } | null = null;
    let pinching = false;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 || pinching) return;
      if ((e.target as Element).closest(INTERACTIVE)) return;
      if (e.pointerType === 'touch' && o.current.compact) return;
      const at = { x: e.clientX, y: e.clientY };
      drag = { id: e.pointerId, start: at, last: at, moved: false };
      node.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id || pinching) return;
      const dx = e.clientX - drag.start.x;
      const dy = e.clientY - drag.start.y;
      if (!drag.moved && Math.hypot(dx, dy) < 3) return;
      if (!drag.moved) {
        drag.moved = true;
        o.current.onDragChange(true);
      }
      // The ground under the last pointer position follows the pointer.
      const prev = ground(local(drag.last.x, drag.last.y));
      const now = ground(local(e.clientX, e.clientY));
      carry(prev, now, o.current.getCam().k);
      drag.last = { x: e.clientX, y: e.clientY };
    };
    const endDrag = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.moved) o.current.onDragChange(false);
      drag = null;
      if (node.hasPointerCapture(e.pointerId)) node.releasePointerCapture(e.pointerId);
    };

    /* ----- wheel / trackpad pinch ----- */
    const onWheel = (e: WheelEvent) => {
      if ((e.target as Element).closest('.map-controls, .legend, .diagram-callout, .diagram-backdrop')) return;
      const zoomKey = e.ctrlKey || e.metaKey;
      if (o.current.compact && !zoomKey) {
        hint(`Use ${isMac ? '⌘' : 'Ctrl'} + scroll to zoom the map`);
        return;
      }
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      const dy = Math.max(-120, Math.min(120, e.deltaY * unit));
      // Trackpad pinch arrives as ctrl+wheel with small deltas; give it more gain.
      const factor = Math.exp(-dy * (e.ctrlKey ? 0.012 : 0.0022));
      const cam = o.current.getCam();
      const k = o.current.clampK(cam.k * factor);
      if (k === cam.k) return;
      const w = ground(local(e.clientX, e.clientY));
      carry(w, w, k);
    };

    /* ----- two-finger touch: pan + pinch ----- */
    let pinch: { mid: Point; dist: number; k: number } | null = null;
    const two = (t: TouchList) => {
      const a = local(t[0].clientX, t[0].clientY);
      const b = local(t[1].clientX, t[1].clientY);
      return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) };
    };
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        pinching = true;
        if (drag) {
          if (drag.moved) o.current.onDragChange(false);
          drag = null;
        }
        const { mid, dist } = two(e.touches);
        pinch = { mid, dist, k: o.current.getCam().k };
      }
    };
    let oneFinger: Point | null = null;
    const onTouchMove = (e: TouchEvent) => {
      if (pinch && e.touches.length === 2) {
        e.preventDefault();
        const { mid, dist } = two(e.touches);
        const k = o.current.clampK(pinch.k * (dist / pinch.dist));
        carry(ground(pinch.mid), ground(mid), k);
        pinch.mid = mid;
        return;
      }
      if (o.current.compact && e.touches.length === 1) {
        const t = e.touches[0];
        if (!oneFinger) oneFinger = { x: t.clientX, y: t.clientY };
        else if (Math.hypot(t.clientX - oneFinger.x, t.clientY - oneFinger.y) > 24) hint('Use two fingers to move the map');
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        pinch = null;
        pinching = false;
      }
      if (e.touches.length === 0) oneFinger = null;
    };

    node.addEventListener('pointerdown', onPointerDown);
    node.addEventListener('pointermove', onPointerMove);
    node.addEventListener('pointerup', endDrag);
    node.addEventListener('pointercancel', endDrag);
    node.addEventListener('wheel', onWheel, { passive: false });
    node.addEventListener('touchstart', onTouchStart, { passive: false });
    node.addEventListener('touchmove', onTouchMove, { passive: false });
    node.addEventListener('touchend', onTouchEnd);
    node.addEventListener('touchcancel', onTouchEnd);
    return () => {
      node.removeEventListener('pointerdown', onPointerDown);
      node.removeEventListener('pointermove', onPointerMove);
      node.removeEventListener('pointerup', endDrag);
      node.removeEventListener('pointercancel', endDrag);
      node.removeEventListener('wheel', onWheel);
      node.removeEventListener('touchstart', onTouchStart);
      node.removeEventListener('touchmove', onTouchMove);
      node.removeEventListener('touchend', onTouchEnd);
      node.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [el]);
}
