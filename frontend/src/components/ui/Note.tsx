import type { ReactNode } from 'react';

/** Props for {@link Note}. */
export interface NoteProps {
  /** `warn` swaps the brand edge for the loss edge; used before a destructive confirm. */
  tone?: 'info' | 'warn';
  children: ReactNode;
}

/**
 * A short explanatory panel with a coloured left edge.
 *
 * @param props - Tone and content.
 * @returns A div.
 */
export function Note({ tone = 'info', children }: NoteProps): ReactNode {
  return (
    <div
      className={`rounded-r rounded-l-none border-l-2 bg-glass-soft px-3 py-2.25 text-[11.5px] leading-[1.55] ${
        tone === 'warn' ? 'border-l-loss-edge-hot text-text-2' : 'border-l-brand-edge text-muted'
      }`}
    >
      {children}
    </div>
  );
}

/**
 * A mono uppercase section label with a rule beneath it.
 *
 * @param props - The label text.
 * @returns A div.
 */
export function SectionLabel({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className="mb-2.75 border-b border-rule pb-1.75 font-mono text-[9.5px] uppercase tracking-[.12em] text-faint">
      {children}
    </div>
  );
}

/**
 * A grey block standing in for content that is loading.
 *
 * @param props - Extra classes for size.
 * @returns A div.
 */
export function Skeleton({ className = '' }: { className?: string }): ReactNode {
  return <div className={`animate-pulse rounded-sm bg-glass-soft ${className}`} aria-hidden="true" />;
}
