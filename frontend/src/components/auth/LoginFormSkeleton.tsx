import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Note';

/** Props for {@link LoginFormSkeleton}. */
export interface LoginFormSkeletonProps {
  /**
   * `restoring` while the first session check is in flight; `opening` when a session already
   * exists and the blotter is about to replace this page.
   */
  state: 'restoring' | 'opening';
}

/**
 * The form's silhouette, row for row at the form's own heights, so the column never moves when
 * the real form takes its place. In the `opening` state the button slot says what is happening,
 * because a person who arrives already signed in deserves a word rather than a pulse.
 *
 * @param props - Which of the two waits this is.
 * @returns The silhouette.
 */
export function LoginFormSkeleton({ state }: LoginFormSkeletonProps): ReactNode {
  const opening = state === 'opening';

  return (
    <div className="flex flex-col gap-[14px] animate-fade" aria-busy="true" aria-label={opening ? 'Opening the desk' : 'Checking for an open session'}>
      <Skeleton className="h-[71px]" />
      <Skeleton className="h-[71px]" />
      <div className="min-h-[34px]" aria-hidden="true" />
      {opening ? (
        <Button type="button" variant="primary" block className="h-[38px]" disabled>
          Opening the desk
        </Button>
      ) : (
        <Skeleton className="h-[38px]" />
      )}
      <div role="status" aria-live="polite" className="min-h-[16px] font-mono text-[10.5px] text-brand-lo">
        {opening ? `Session adopted ${'·'} opening the desk` : ''}
      </div>
      <Skeleton className="h-[37px]" />
    </div>
  );
}
