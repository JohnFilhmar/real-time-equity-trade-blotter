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

/** The outline a {@link Skeleton} takes. */
export type SkeletonShape = 'block' | 'control' | 'pill';

const skeleton_shape_classes: Record<SkeletonShape, string> = {
  block: 'rounded-sm',
  control: 'rounded-r',
  pill: 'rounded-full',
};

/** Props for {@link Skeleton}. */
export interface SkeletonProps {
  /** Size classes, plus spacing or breakpoint visibility where the block sits among other content. */
  className?: string;
  /** `block` stands in for text or a figure, `control` for an input or a button, `pill` for an avatar or a chip. */
  shape?: SkeletonShape;
  /**
   * Sits the block inside a line of text, centred on it. The line keeps the height its text would
   * give it, so a skeleton placed in an element that carries a real line's classes is exactly as
   * tall as that line. Keep the block shorter than the line.
   */
  inline?: boolean;
}

/**
 * A grey block standing in for content that is loading. Every loading shape on the blotter is
 * built from this one block.
 *
 * @param props - Size classes, the shape, and whether the block sits in a line of text.
 * @returns A div, or a span when inline.
 */
export function Skeleton({ className = '', shape = 'block', inline = false }: SkeletonProps): ReactNode {
  const classes = `animate-pulse bg-glass-soft ${skeleton_shape_classes[shape]} ${className}`;

  return inline ? (
    <span className={`inline-block align-middle ${classes}`} aria-hidden="true" />
  ) : (
    <div className={classes} aria-hidden="true" />
  );
}
