'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/** Props for {@link Dialog}. */
export interface DialogProps {
  /** The heading, also the accessible name. */
  title: string;
  /** One line under the heading. */
  description?: ReactNode;
  /** Narrow width for a confirmation; the default suits a form. */
  size?: 'sm' | 'md';
  /** Called on Escape, scrim click, or the close button. */
  onClose: () => void;
  /** Footer buttons. */
  footer: ReactNode;
  children: ReactNode;
}

const focusable = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A modal over a blurred scrim. Focus moves inside on open, stays inside while open, and the
 * caller returns it to where it came from on close.
 *
 * @param props - Title, description, size, close handler, footer and body.
 * @returns The scrim and the panel.
 */
export function Dialog({ title, description, size = 'md', onClose, footer, children }: DialogProps): ReactNode {
  const panel = useRef<HTMLDivElement>(null);
  const title_id = `dialog_${title.replace(/\W+/g, '_').toLowerCase()}`;

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
      className="absolute inset-0 z-[60] flex animate-fade items-center justify-center bg-scrim p-4 backdrop-blur-[4px]"
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
        className={`flex max-h-full w-full animate-rise flex-col overflow-hidden rounded-[12px] border border-glass-edge bg-glass shadow-glass backdrop-blur-[22px] backdrop-saturate-150 ${size === 'sm' ? 'max-w-[428px]' : 'max-w-[552px]'}`}
      >
        <div className="flex shrink-0 items-start gap-3 border-b border-rule px-[18px] py-[15px]">
          <div className="flex-1">
            <h2 id={title_id} className="m-0 text-[15px] font-semibold tracking-[-.012em] text-balance">
              {title}
            </h2>
            {description !== undefined ? <p className="mt-[3px] mb-0 text-[12px] text-muted">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-7 w-7 place-items-center rounded-[6px] text-muted hover:bg-glass-soft hover:text-brand-lo"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex flex-col gap-[15px] overflow-y-auto p-[18px]">{children}</div>
        <div className="flex shrink-0 justify-end gap-[9px] border-t border-rule bg-foot px-[18px] py-[13px]">{footer}</div>
      </div>
    </div>
  );
}
