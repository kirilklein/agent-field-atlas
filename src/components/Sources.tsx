import type { Source } from '../data/types';

export function Sources({ sources }: { sources?: Source[] }) {
  if (!sources?.length) return null;
  return (
    <p className="sources">
      Read the source:{' '}
      {sources.map((s, n) => (
        <span key={s.url}>
          {n > 0 && ' · '}
          <a href={s.url} target="_blank" rel="noreferrer">
            {s.title}
          </a>
        </span>
      ))}
    </p>
  );
}
