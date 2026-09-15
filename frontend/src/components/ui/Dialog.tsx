'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/** Where a {@link Dialog} sits. */
export type DialogPlacement = 'center' | 'left';

/** Props for {@link Dialog}. */
export interface DialogProps {
  /** The heading, also the accessible name. */
  title: string;
  /** One line under the heading. */
  description?: ReactNode;
  /** Width of a centred dialog: narrow for a confirmation; the default suits a form. A left panel takes its content's width. */
  size?: 'sm' | 'md';
  /**
   * `center`, the default, floats the dialog over the section that opened it. `left` is a
   * full-height panel that slides in from the left edge of the frame, over the top bar, the tabs and
   * any open drawer, for controls that apply as they change, such as the filters.
   */
  placement?: DialogPlacement;
  /** Called on Escape, scrim click, or the close button. */
  onClose: () => void;
  /** Footer buttons. Omit when the body's controls act on their own. */
  footer?: ReactNode;
  children: ReactNode;
}

const focusable = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Per placement: the scrim, the panel, and the body between the header and the footer. */
const placement_classes: Record<DialogPlacement, { scrim: string; panel: string; body: string }> = {
  center: {
    scrim: 'absolute inset-0 items-center justify-center p-4',
    panel: 'max-h-full w-full animate-rise rounded-xl border',
    body: 'flex flex-col gap-3.75 overflow-y-auto p-4.5',
  },
  left: {
    scrim: 'fixed inset-0',
    panel: 'h-full max-w-full translate-x-0 border-r transition-transform duration-200 ease-out starting:-translate-x-full',
    body: 'flex min-h-0 flex-1',
  },
};

/**
 * A modal over a blurred scrim. Focus moves inside on open, stays inside while open, and the
 * caller returns it to where it came from on close.
 *
 * @param props - Title, description, size, placement, close handler, footer and body.
 * @returns The scrim and the panel.
 */
export function Dialog({ title, description, size = 'md', placement = 'center', onClose, footer, children }: DialogProps): ReactNode {
  const panel = useRef<HTMLDivElement>(null);
  const title_id = `dialog_${title.replace(/\W+/g, '_').toLowerCase()}`;
  const classes = placement_classes[placement];
  const width = placement === 'center' ? (size === 'sm' ? 'max-w-107' : 'max-w-138') : '';

  useEffect(() => {
    const first = panel.current?.querySelector<HTMLElement>(focusable);
    first?.focus();
  }, []);

  // Escape closes the dialog wherever focus sits. Focus can fall to the body when the control that
  // held it becomes disabled, and a modal that then ignores Escape is a trap.
  useEffect(() => {
    const on_document_key = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', on_document_key);
    return () => document.removeEventListener('keydown', on_document_key);
  }, [onClose]);

  const on_key_down = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Tab' || panel.current === null) {
      return;
    }

    const items = Array.from(panel.current.querySelectorAll<HTMLElement>(focusable));
    const first = items[0];
    const last = items.at(-1);
    if (first === undefined || last === undefined) {
      return;
    }

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className={`z-[60] flex animate-fade bg-scrim backdrop-blur-xs ${classes.scrim}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title_id}
        onKeyDown={on_key_down}
        className={`flex flex-col overflow-hidden border-glass-edge bg-glass shadow-glass backdrop-blur-[22px] backdrop-saturate-150 ${classes.panel} ${width}`}
      >
        <div className="flex shrink-0 items-start gap-3 border-b border-rule px-4.5 py-3.75">
          <div className="flex-1">
            <h2 id={title_id} className="m-0 text-[15px] font-semibold tracking-[-.012em] text-balance">
              {title}
            </h2>
            {description !== undefined ? <p className="mt-0.75 mb-0 text-[12px] text-muted">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-glass-soft hover:text-brand-lo"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className={classes.body}>{children}</div>
        {footer !== undefined ? (
          <div className="flex shrink-0 justify-end gap-2.25 border-t border-rule bg-foot px-4.5 py-3.25">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
