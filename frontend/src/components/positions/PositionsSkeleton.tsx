'use client';

import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/Note';
import { PositionsTableSkeleton, positions_screen_classes, positions_scroll_classes, positions_toolbar_classes } from './PositionsScreen';

/**
 * The positions screen while the session restores: the toolbar's chips, count and Refresh, then the
 * table skeleton, on the screen's own classes so nothing moves when the screen takes over.
 *
 * @returns The skeleton screen.
 */
export function PositionsSkeleton(): ReactNode {
  return (
    <div className={positions_screen_classes}>
      <div className={positions_toolbar_classes}>
        <div className="flex flex-wrap gap-1.5">
          <Skeleton shape="pill" className="h-6.5 w-30" />
          <Skeleton shape="pill" className="h-6.5 w-40" />
          <Skeleton shape="pill" className="h-6.5 w-18" />
        </div>
        <div className="ml-auto flex items-center gap-2.25">
          <span className="text-[10.5px]">
            <Skeleton inline className="h-2 w-16" />
          </span>
          <Skeleton shape="control" className="h-7.75 w-20" />
        </div>
      </div>
      <div className={positions_scroll_classes} aria-busy="true">
        <PositionsTableSkeleton />
      </div>
    </div>
  );
}
