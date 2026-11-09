import { useMemo, useRef, useState } from 'react';
import { CHECKPOINTS, CHECK_PY, EXERCISES, SUPPORT_FILES, addedLines, type CheckpointId } from '../data/companion';
import { inlineCode } from '../lib/highlight';
import { CodeBlock } from './CodeBlock';

type Props = { id: CheckpointId };

const listOf = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

function Terminal({ output }: { output: string }) {
  return (
    <pre className="terminal" aria-label="Terminal output">
      {output.split('\n').map((line, i) => (
        <span
          key={i}
          className={
            line.startsWith('$')
              ? 'terminal__cmd'
              : /^✓/.test(line)
                ? 'terminal__good'
                : /✗|never ran|rejected|step_budget/.test(line)
                  ? 'terminal__bad'
                  : undefined
          }
        >
          {line}
          {'\n'}
        </span>
      ))}
    </pre>
  );
}

export function CheckpointView({ id }: Props) {
  const cp = CHECKPOINTS[id];
  const isNumbered = typeof id === 'number';
  const files = useMemo(
    () => [cp.file, ...SUPPORT_FILES, ...(cp.extra ?? []), ...(cp.practice ? [CHECK_PY] : [])],
    [cp],
  );
  const [runIdx, setRunIdx] = useState(0);
  const [fileIdx, setFileIdx] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);
  const [showSolution, setShowSolution] = useState(false);
  const codeRef = useRef<HTMLDivElement>(null);
  const added = useMemo(() => (cp.previous ? addedLines(cp.previous, cp.file.code) : []), [cp]);
  const solutionAdded = useMemo(
    () => (cp.practice ? addedLines(cp.file.code, cp.practice.solution) : []),
    [cp],
  );
  const exercises = EXERCISES.filter((e) => e.checkpoint === id);
  const file = files[fileIdx];
  const run = cp.runs[runIdx];

  const flash = (msg: string) => {
    setCopied(msg);
    window.setTimeout(() => setCopied(null), 1800);
  };
  const copy = () => {
    const selectInstead = () => {
      const pre = codeRef.current?.querySelector('pre');
      const sel = window.getSelection();
      if (!pre || !sel) return;
      const range = document.createRange();
      range.selectNodeContents(pre);
      sel.removeAllRanges();
      sel.addRange(range);
      flash('Selected: press Ctrl+C or ⌘C');
    };
    try {
      navigator.clipboard.writeText(file.code).then(() => flash(`Copied ${file.name}`), selectInstead);
    } catch {
      selectInstead();
    }
  };

  const folder = [cp.file.name, ...cp.needs.filter((n) => !n.endsWith('.jsonl')), 'llm.py', 'fake_model.py', 'places.py'];

  return (
    <section className="checkpoint" aria-label={isNumbered ? `Checkpoint ${id}` : 'Run the branch'}>
      <h3 className="section-title">Run it</h3>
      <p className="cp__lead">
        Put {folder.map((f, i) => (
          <span key={f}>
            {i > 0 && (i === folder.length - 1 ? ' and ' : ', ')}
            <code>{f}</code>
          </span>
        ))}
        {cp.extra?.some((f) => f.name.endsWith('.jsonl')) ? <> plus the fixture files</> : null} in one folder. Python 3.9+
        and the standard library are all it needs.
      </p>
      {cp.runs.length > 1 && (
        <div className="scenarios" role="group" aria-label="Command">
          {cp.runs.map((r, i) => (
            <button key={r.label} type="button" className="scenario" aria-pressed={i === runIdx} onClick={() => setRunIdx(i)}>
              {r.label}
            </button>
          ))}
        </div>
      )}
      <Terminal output={run.output} />

      <h3 className="section-title cp__code-title">The code</h3>
      <div className="cp__files">
        <div className="filetabs" role="group" aria-label="File">
          {files.map((f, i) => (
            <button key={f.name} type="button" className="filetab" aria-pressed={i === fileIdx} onClick={() => setFileIdx(i)}>
              {f.name}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn--ghost cp__copy" onClick={copy}>
          {copied ?? `Copy ${file.name}`}
        </button>
      </div>
      <p className="cp__note" aria-live="polite">
        {fileIdx === 0
          ? cp.previous
            ? `${added.length} lines are new since checkpoint ${Number(id) - 1}; they are highlighted.`
            : isNumbered
              ? 'The first checkpoint: every line is new.'
              : `A branch file: it imports ${listOf(cp.needs.filter((n) => n.endsWith('.py')))} instead of copying them.`
          : file.note}
      </p>
      <div ref={codeRef}>
        <CodeBlock
          key={file.name}
          code={file.code}
          language={file.language}
          label={file.name}
          highlight={fileIdx === 0 && added.length ? added : undefined}
          follow
          className="code--file"
        />
      </div>

      {cp.practice && exercises.length > 0 && (
        <div className="practice">
          <h3 className="section-title">Try it yourself</h3>
          <ol className="practice__list">
            {exercises.map((e) => (
              <li key={e.id} className="exercise">
                <p className="exercise__title">
                  <span className="exercise__id">{e.id}</span> {e.title}
                </p>
                <p className="exercise__task">{inlineCode(e.task)}</p>
                <details className="exercise__hint">
                  <summary>Hint</summary>
                  <p>{inlineCode(e.hint)}</p>
                </details>
              </li>
            ))}
          </ol>
          <p className="cp__lead">
            Edit <code>{cp.file.name}</code>, then check your work. Before you start, every check fails with a reason:
          </p>
          <Terminal output={cp.practice.before} />
          <button
            type="button"
            className="btn btn--ghost practice__reveal"
            aria-expanded={showSolution}
            onClick={() => setShowSolution((v) => !v)}
          >
            {showSolution ? 'Hide the solution' : 'Show a solution'}
          </button>
          {showSolution && (
            <>
              <p className="cp__note">
                <code>solutions/{cp.file.name}</code>: {solutionAdded.length} changed lines, highlighted. Run{' '}
                <code>python check.py {String(id)} --solutions</code> to see it pass.
              </p>
              <CodeBlock
                code={cp.practice.solution}
                language="python"
                label={`solutions/${cp.file.name}`}
                highlight={solutionAdded}
                follow
                className="code--file"
              />
            </>
          )}
        </div>
      )}

      <p className="fixture-note">
        These files live in the project’s <code>companion/</code> folder. Set <code>ATLAS_MODEL=claude</code> to run them
        against Claude instead of the fake model.
      </p>
    </section>
  );
}
