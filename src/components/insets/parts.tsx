import type { ReactNode } from 'react';

/** Shared drawing pieces for the field insets (SVG, viewBox units). */

export type Tone = 'msg' | 'model' | 'tool' | 'ok' | 'bad' | 'host' | 'warn' | 'muted';

const CHAR = 5.75; // mono 9.5px advance, close enough for sizing chips

const chipWidth = (text: string) => Math.round(text.length * CHAR + 14);

const backOut = (t: number) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);

/** A labelled box: a part of the system (Model, Your code, Tool …), centred on x, y. */
export function Station({
  x,
  y,
  label,
  w = 78,
  h = 26,
  on = false,
  ghost = false,
  bad = false,
  sub,
}: {
  x: number;
  y: number;
  label: string;
  w?: number;
  h?: number;
  on?: boolean;
  ghost?: boolean;
  bad?: boolean;
  sub?: string;
}) {
  return (
    <g className={`ins-station ${on ? 'is-on' : ''} ${ghost ? 'is-ghost' : ''} ${bad ? 'is-bad' : ''}`} transform={`translate(${x} ${y})`}>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={6} />
      <text y={1} textAnchor="middle" dominantBaseline="middle">
        {label}
      </text>
      {sub && (
        <text className="ins-station__sub" y={h / 2 + 10} textAnchor="middle">
          {sub}
        </text>
      )}
    </g>
  );
}

/** A small mono pill: a proposal, a result, an error. */
export function Chip({
  x,
  y,
  text,
  tone = 'model',
  opacity = 1,
  anchor = 'middle',
  scale = 1,
}: {
  x: number;
  y: number;
  text: string;
  tone?: Tone;
  opacity?: number;
  anchor?: 'start' | 'middle' | 'end';
  scale?: number;
}) {
  if (opacity <= 0.001) return null;
  const w = chipWidth(text);
  const x0 = anchor === 'middle' ? -w / 2 : anchor === 'end' ? -w : 0;
  return (
    <g className={`ins-chip tone-${tone}`} transform={`translate(${x} ${y}) scale(${scale})`} opacity={opacity}>
      <rect x={x0} y={-8.5} width={w} height={17} rx={8.5} />
      <text x={x0 + w / 2} y={0.5} textAnchor="middle" dominantBaseline="middle">
        {text}
      </text>
    </g>
  );
}

/** ✓ or ✕ in a disc, popping in as p goes 0 → 1. */
export function Mark({ x, y, ok, p }: { x: number; y: number; ok: boolean; p: number }) {
  if (p <= 0.001) return null;
  const s = Math.max(0, backOut(Math.min(1, p)));
  return (
    <g className={`ins-mark ${ok ? 'is-ok' : 'is-bad'}`} transform={`translate(${x} ${y}) scale(${s})`}>
      <circle r={9} />
      {ok ? <path d="M-4 0.5 L-1.2 3.3 L4.2 -3" /> : <path d="M-3.4 -3.4 L3.4 3.4 M3.4 -3.4 L-3.4 3.4" />}
    </g>
  );
}

/** The moving thing: a glowing copper dot. */
export function Token({ x, y, opacity = 1 }: { x: number; y: number; opacity?: number }) {
  if (opacity <= 0.001) return null;
  return (
    <g className="ins-token" transform={`translate(${x} ${y})`} opacity={opacity}>
      <circle r={9} className="ins-token__halo" />
      <circle r={4.5} />
    </g>
  );
}

/** A message card: a short labelled bar, used for message lists and documents. */
export function Card({
  x,
  y,
  w = 70,
  label,
  tone = 'msg',
  opacity = 1,
}: {
  x: number;
  y: number;
  w?: number;
  label: string;
  tone?: Tone;
  opacity?: number;
}) {
  if (opacity <= 0.001) return null;
  return (
    <g className={`ins-card tone-${tone}`} transform={`translate(${x} ${y})`} opacity={opacity}>
      <rect x={0} y={-7} width={w} height={14} rx={3} />
      <text x={6} y={0.5} dominantBaseline="middle">
        {label}
      </text>
    </g>
  );
}

/** Small caps annotation text. */
export function Note({
  x,
  y,
  children,
  anchor = 'middle',
  tone,
  opacity = 1,
  big = false,
}: {
  x: number;
  y: number;
  children: ReactNode;
  anchor?: 'start' | 'middle' | 'end';
  tone?: Tone;
  opacity?: number;
  big?: boolean;
}) {
  if (opacity <= 0.001) return null;
  return (
    <text
      className={`ins-note ${big ? 'is-big' : ''} ${tone ? `tone-${tone}` : ''}`}
      x={x}
      y={y}
      textAnchor={anchor}
      dominantBaseline="middle"
      opacity={opacity}
    >
      {children}
    </text>
  );
}
