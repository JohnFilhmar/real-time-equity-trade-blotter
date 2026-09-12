'use client';

import type { ReactNode } from 'react';
import { useToastStore, type ToastKind } from '@/lib/stores/toast_store';

const edge: Record<ToastKind, string> = {
  ok: 'border-l-gain',
  warn: 'border-l-warn',
  err: 'border-l-loss',
};

/**
 * Renders the toast queue in the bottom-right corner of the app frame. Announced politely, so a
 * screen reader hears "Booked TRD-100512" without being interrupted.
 *
 * @returns The toast stack.
 */
export function Toasts(): ReactNode {
  const toasts = useToastStore((state) => state.toasts);

  return (
    <div
      className="pointer-events-none absolute right-[14px] bottom-[14px] z-[80] flex max-w-[calc(100%-28px)] flex-col items-end gap-2"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex max-w-full animate-rise items-center gap-[9px] rounded-r border border-glass-edge border-l-2 bg-glass px-[14px] py-[10px] text-[12.5px] shadow-glass backdrop-blur-[18px] ${edge[toast.kind]}`}
        >
          <b className="font-semibold">{toast.title}</b>
          {toast.detail.length > 0 ? <span className="text-muted">{toast.detail}</span> : null}
        </div>
      ))}
    </div>
  );
}
