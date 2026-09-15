'use client';

import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/Note';
import { AuditRowsSkeleton, audit_list_classes, audit_screen_classes, audit_toolbar_classes } from './AuditScreen';

/**
 * The audit trail while the session restores: the toolbar's chips, count and Refresh, then the
 * skeleton lines, on the screen's own classes so nothing moves when the screen takes over.
 *
 * @returns The skeleton screen.
 */
export function AuditSkeleton(): ReactNode {
  return (
    <div className={audit_screen_classes}>
      <div className={audit_toolbar_classes}>
        <div className="flex flex-wrap gap-1.5">
          <Skeleton shape="pill" className="h-6.5 w-20" />
          <Skeleton shape="pill" className="h-6.5 w-28" />
          <Skeleton shape="pill" className="h-6.5 w-28" />
          <Skeleton shape="pill" className="h-6.5 w-18" />
        </div>
        <div className="ml-auto flex items-center gap-2.25">
          <span className="text-[10.5px]">
            <Skeleton inline className="h-2 w-24" />
          </span>
          <Skeleton shape="control" className="h-7.75 w-20" />
        </div>
      </div>
      <div className={audit_list_classes} aria-busy="true">
        <AuditRowsSkeleton />
      </div>
    </div>
  );
}
