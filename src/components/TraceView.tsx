import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { Trace, TraceBlock } from '../data/traceTypes';
import { CodeBlock } from './CodeBlock';

type Props = { trace: Trace; prompt: string; reduced: boolean };

function describeLines(lines: number[]): string {
  if (!lines.length) return '';
  const sorted = [...new Set(lines)].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (const n of sorted.slice(1).concat(Infinity)) {
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    ranges.push(start === prev ? `${start}` : `${start}–${prev}`);
    start = prev = n;
  }
  return `${ranges.length > 1 || sorted.length > 1 ? 'lines' : 'line'} ${ranges.join(', ')}`;
}

function Block({ block }: { block: TraceBlock }) {
  switch (block.kind) {
    case 'json':
      return (
        <div className={`blk blk--json ${block.tone ? `tone-${block.tone}` : ''}`}>
          <div className="blk__label">{block.label}</div>
          <CodeBlock code={JSON.stringify(block.value, null, 2)} language="json" className="code--plain" />
        </div>
      );
    case 'text':
      return (
        <div className={`blk blk--text ${block.tone ? `tone-${block.tone}` : ''}`}>
          <div className="blk__label">{block.label}</div>
          <pre className="blk__raw">{block.text}</pre>
        </div>
      );
    case 'checks':
      return (
        <div className="blk">
          <div className="blk__label">{block.label}</div>
          <ul className="checks">
            {block.items.map((it) => (
              <li key={it.label} className={`check check--${it.state}`}>
                <span className="check__icon" aria-hidden="true">
                  {it.state === 'pass' ? '✓' : it.state === 'fail' ? '✕' : '–'}
                </span>
                <span className="check__label">
                  {it.label}
                  <span className="sr-only">: {it.state === 'pass' ? 'passed' : it.state === 'fail' ? 'failed' : 'not checked'}</span>
                </span>
                <code className="check__detail">{it.detail}</code>
              </li>
            ))}
          </ul>
        </div>
      );
    case 'allowlist': {
      const ok = block.allowed.includes(block.proposed);
      return (
        <div className="blk">
          <div className="blk__label">Allowlist</div>
          <div className="allow">
            <code className="allow__set">
              ALLOWED_TOOLS = {'{'}
              {block.allowed.map((a) => (
                <span key={a} className={`chip ${a === block.proposed ? 'chip--match' : ''}`}>
                  {a}
                </span>
              ))}
              {'}'}
            </code>
            <span className={`allow__verdict ${ok ? 'is-ok' : 'is-bad'}`}>
              <code>{block.proposed}</code> {ok ? 'is on the list' : 'is not on the list'}
            </span>
          </div>
        </div>
      );
    }
    case 'places':
      return (
        <div className="blk tone-ok">
          <div className="blk__label">Tool ran</div>
          <code className="blk__call">{block.call}</code>
          <ol className="places">
            {block.places.map((p) => (
              <li key={p.id} className="place">
                <span className="place__title">{p.name}</span>
                <span className="place__meta">
                  {p.indoor ? 'Indoors' : 'Outdoors'} · ages {p.min_age}+ · <code>{p.id}</code>
                </span>
                <span className="place__summary">{p.summary}</span>
              </li>
            ))}
          </ol>
          <p className="fixture-note">Fixture results, recorded once. Notes written for this course.</p>
        </div>
      );
    case 'notRun':
      return (
        <div className="blk notrun" role="note">
          <div className="notrun__head">
            <span className="notrun__icon" aria-hidden="true">
              ⊘
            </span>
            <span>
              <code>{block.tool}</code> never ran
            </span>
          </div>
          <p className="notrun__reason">
            Rejected by the host: <code>{block.reason}</code>
          </p>
        </div>
      );
    case 'note':
      return <p className="blk-note">{block.text}</p>;
  }
}

export function TraceView({ trace, prompt, reduced }: Props) {
  const [scenarioId, setScenarioId] = useState(trace.scenarios[0].id);
  const [stepIdx, setStepIdx] = useState(0);
  const scenario = trace.scenarios.find((s) => s.id === scenarioId) ?? trace.scenarios[0];
  const step = scenario.steps[stepIdx];
  const last = scenario.steps.length - 1;
  const titleId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    cardRef.current?.classList.remove('is-entering');
    void cardRef.current?.offsetWidth;
    cardRef.current?.classList.add('is-entering');
  }, [stepIdx, scenarioId]);

  const executions = trace.counter
    ? scenario.steps.slice(0, stepIdx + 1).filter((s) => s.actor === trace.counter!.actor).length
    : 0;
  const rejected = scenario.steps.some((s) => s.blocks.some((b) => b.kind === 'notRun'));
  const doneRejected = rejected && scenario.steps.slice(0, stepIdx + 1).some((s) => s.blocks.some((b) => b.kind === 'notRun'));

  const go = (i: number) => setStepIdx(Math.max(0, Math.min(last, i)));
  const onKey = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      go(stepIdx + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      go(stepIdx - 1);
    }
  };

  return (
    <section className="trace" aria-labelledby={titleId} onKeyDown={onKey}>
      <div className="trace__head">
        <h3 id={titleId} className="section-title">
          Step through it
        </h3>
        <p className="trace__prompt">{prompt}</p>
      </div>

      <div className="scenarios" role="group" aria-label="Scenario">
        {trace.scenarios.map((s) => (
          <button
            key={s.id}
            type="button"
            className="scenario"
            aria-pressed={s.id === scenario.id}
            onClick={() => {
              setScenarioId(s.id);
              setStepIdx(0);
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
      <p className="trace__input">
        <span className="trace__input-label">Input</span>
        <code>{scenario.input}</code>
      </p>

      <ol className="rail" aria-label="Steps">
        {scenario.steps.map((s, i) => (
          <li key={i}>
            <button
              type="button"
              className={`rail__step ${i === stepIdx ? 'is-current' : ''} ${i < stepIdx ? 'is-past' : ''} ${s.tone ? `tone-${s.tone}` : ''}`}
              aria-current={i === stepIdx ? 'step' : undefined}
              onClick={() => go(i)}
            >
              <span className="rail__n" aria-hidden="true">
                {i + 1}
              </span>
              <span className="rail__label">{s.phase}</span>
            </button>
          </li>
        ))}
      </ol>

      <p className="sr-only" aria-live="polite">
        {`${scenario.label}, step ${stepIdx + 1} of ${scenario.steps.length}: ${step.title}. ${step.summary}`}
      </p>
      <div ref={cardRef} className={`step tone-${step.tone ?? 'neutral'}`}>
        <div className="step__head">
          <span className={`actor actor--${step.actor.toLowerCase()}`}>{step.actor}</span>
          <span className="step__count">
            Step {stepIdx + 1} of {scenario.steps.length}
          </span>
        </div>
        <h4 className="step__title">{step.title}</h4>
        <p className="step__summary">{step.summary}</p>
        <div className="step__blocks">
          {step.blocks.map((b, i) => (
            <Block key={`${scenario.id}-${stepIdx}-${i}`} block={b} />
          ))}
        </div>
      </div>

      <div className="trace__controls">
        <button type="button" className="btn btn--ghost" onClick={() => go(stepIdx - 1)} disabled={stepIdx === 0}>
          ← Previous
        </button>
        {trace.counter && (
          <span className={`counter ${doneRejected && executions === 0 ? 'is-zero' : ''}`}>
            {trace.counter.label}: <span className="counter__n">{executions}</span>
          </span>
        )}
        {stepIdx < last ? (
          <button type="button" className="btn btn--primary" onClick={() => go(stepIdx + 1)}>
            Next step →
          </button>
        ) : (
          <button type="button" className="btn btn--primary" onClick={() => go(0)}>
            ↺ Replay
          </button>
        )}
      </div>

      <div className="trace__code">
        <p className="trace__code-caption">
          <code>{trace.file}</code> — highlighting {describeLines(step.lines)}
        </p>
        <CodeBlock code={scenario.code ?? trace.code} language="python" label={trace.file} highlight={step.lines} follow smooth={!reduced} className="code--trace" />
      </div>
    </section>
  );
}
