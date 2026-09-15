'use client';

import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/Note';
import { useConnectionStatus } from '@/hooks/useConnection';
import { BlotterRowsSkeleton } from './BlotterRowsSkeleton';
import { blotter_body_classes, blotter_rail_wrapper_classes, blotter_screen_classes, blotter_toolbar_classes } from './BlotterScreen';
import { filter_rail_classes } from './FilterRail';
import { ConnectionBanner } from './TableState';

/** The rail's rows between its header and its foot: a field is label, control and message line; toggles are label and a pair. */
const rail_rows: ReadonlyArray<'field' | 'toggles'> = ['field', 'toggles', 'toggles', 'field', 'field', 'field', 'field', 'field'];

/**
 * The rail from `lg` up, on the rail's own column classes, so the grid beside it starts where it
 * will stay.
 *
 * @returns The rail skeleton.
 */
function RailSkeleton(): ReactNode {
  return (
    <div className={filter_rail_classes}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[9.5px]">
          <Skeleton inline className="h-2 w-12" />
        </span>
      </div>
      {rail_rows.map((kind, index) => (
        <div key={index} className="flex flex-col gap-1.25">
          <div className="text-[9.5px]">
            <Skeleton inline className="h-2 w-16" />
          </div>
          {kind === 'field' ? (
            <>
              <Skeleton shape="control" className="h-8.25" />
              <div className="min-h-3.5" />
            </>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              <Skeleton shape="control" className="h-8.25" />
              <Skeleton shape="control" className="h-8.25" />
            </div>
          )}
        </div>
      ))}
      <div className="mt-auto flex flex-col gap-2.25 border-t border-rule pt-3">
        <div className="text-[10.5px]">
          <Skeleton inline className="h-2 w-24" />
        </div>
      </div>
    </div>
  );
}

/**
 * The toolbar on its own row classes: the Filters button below `lg`, a chip, the count, Refresh,
 * and New trade from `md`.
 *
 * @returns The toolbar skeleton.
 */
function ToolbarSkeleton(): ReactNode {
  return (
    <div className={blotter_toolbar_classes}>
      <Skeleton shape="control" className="h-7.75 w-22 lg:hidden" />
      <div className="flex min-w-0 flex-wrap gap-1.5">
        <Skeleton shape="pill" className="h-6.5 w-20" />
      </div>
      <div className="ml-auto flex items-center gap-2.25">
        <span className="text-[10.5px]">
          <Skeleton inline className="h-2 w-14" />
        </span>
        <Skeleton shape="control" className="h-7.75 w-23" />
        <Skeleton shape="control" className="hidden h-7.75 w-22 md:block" />
      </div>
    </div>
  );
}

/**
 * The blotter before its screen can render, while the session restores or the URL is read: the
 * rail from `lg`, the toolbar, the connection banner the screen will show, and the rows or cards,
 * each on the classes the screen itself uses, so nothing moves when the screen takes over.
 *
 * @returns The skeleton screen.
 */
export function BlotterSkeleton(): ReactNode {
  const status = useConnectionStatus();

  return (
    <div className={blotter_screen_classes}>
      <div className={blotter_rail_wrapper_classes}>
        <RailSkeleton />
      </div>
      <div className={blotter_body_classes}>
        <ToolbarSkeleton />
        <ConnectionBanner status={status} />
        <BlotterRowsSkeleton />
      </div>
    </div>
  );
}
