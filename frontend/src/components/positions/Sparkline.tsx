import type { ReactNode } from 'react';

/** Props for {@link Sparkline}. */
export interface SparklineProps {
  /** Values oldest first. Fewer than two points renders nothing. */
  values: readonly number[];
  /** Colour by the sign of the thing the line explains, so a falling mark on a short reads green. */
  tone: 'gain' | 'loss';
  /** Accessible description; the drawing itself is decorative. */
  label: string;
}

const width = 320;
const height = 22;
const pad = 2;

/**
 * A trend line drawn from the recent marks of one symbol, the prototype's `sparkline`, stretched
 * to whatever width its column gives it. The drawing scales with the column; the stroke and the
 * end marker keep their screen size, which is why the marker is a zero-length round-capped line
 * rather than a circle that would squash.
 *
 * @param props - Values, tone and label.
 * @returns An inline SVG, or `null` with fewer than two points.
 */
export function Sparkline({ values, tone, label }: SparklineProps): ReactNode {
  if (values.length < 2) {
    return null;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => {
    const x = pad + (index / (values.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (value - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });
  const path = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const last = points[points.length - 1] ?? [0, 0];
  const colour = tone === 'gain' ? 'var(--gain)' : 'var(--loss)';

  return (
    <svg className="block h-[22px] w-full" viewBox={`0 0 ${width.toString()} ${height.toString()}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <path d={path} fill="none" stroke={colour} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" vectorEffect="non-scaling-stroke" />
      <path d={`M${last[0].toFixed(1)} ${last[1].toFixed(1)} h0.01`} fill="none" stroke={colour} strokeWidth="3.8" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
