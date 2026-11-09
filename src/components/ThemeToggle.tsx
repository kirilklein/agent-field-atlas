import type { ReactNode } from 'react';
import { setTheme, useTheme, type Theme } from '../lib/theme';

const OPTIONS: { id: Theme; label: string; icon: ReactNode }[] = [
  {
    id: 'light',
    label: 'Day map',
    icon: (
      <>
        <circle cx="8" cy="8" r="3" fill="currentColor" />
        <path
          d="M8 1.2v1.6M8 13.2v1.6M1.2 8h1.6M13.2 8h1.6M3.2 3.2l1.1 1.1M11.7 11.7l1.1 1.1M3.2 12.8l1.1-1.1M11.7 4.3l1.1-1.1"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </>
    ),
  },
  {
    id: 'dark',
    label: 'Night map',
    icon: <path d="M10.6 2.2a5.8 5.8 0 1 0 3.2 9.2A4.8 4.8 0 0 1 10.6 2.2Z" fill="currentColor" />,
  },
  {
    id: 'toy',
    label: 'Toy map',
    icon: (
      <>
        <rect x="2" y="7.5" width="12" height="6" rx="1.5" fill="currentColor" />
        <circle cx="5.5" cy="6" r="1.6" fill="currentColor" />
        <circle cx="10.5" cy="6" r="1.6" fill="currentColor" />
      </>
    ),
  },
];

/** Day / night / toy plate. Remembers an explicit choice; otherwise the system decides. */
export function ThemeToggle() {
  const theme = useTheme();
  return (
    <div className="theme-toggle" role="group" aria-label="Map theme">
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          className="theme-toggle__btn"
          aria-pressed={theme === o.id}
          aria-label={o.label}
          title={o.label}
          onClick={() => setTheme(o.id)}
        >
          <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
            {o.icon}
          </svg>
        </button>
      ))}
    </div>
  );
}
