import { create } from 'zustand';

/** How a toast is coloured: a success, a warning, or an error. */
export type ToastKind = 'ok' | 'warn' | 'err';

/** One notification. */
export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  detail: string;
}

/** The toast queue. */
export interface ToastState {
  toasts: readonly Toast[];

  /** Shows a toast for a few seconds. */
  push: (kind: ToastKind, title: string, detail?: string) => void;

  /** Removes one toast early. */
  dismiss: (id: number) => void;
}

/** How long a toast stays on screen, in milliseconds. */
export const toast_lifetime_ms = 4200;

let next_id = 1;

/**
 * The toast store. A store rather than Context because any hook, including a mutation callback
 * outside the tree, may need to announce something.
 */
export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  push: (kind, title, detail = '') => {
    const id = next_id;
    next_id += 1;
    set((state) => ({ toasts: [...state.toasts, { id, kind, title, detail }] }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
    }, toast_lifetime_ms);
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));
