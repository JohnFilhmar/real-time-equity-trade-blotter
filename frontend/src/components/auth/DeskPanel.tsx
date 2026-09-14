import type { ReactNode } from 'react';
import { BrandMark } from '@/components/ui/BrandMark';
import { DeskReadiness } from './DeskReadiness';
import { SessionClock } from './SessionClock';

/**
 * The left side of the door: who the desk is, what time it is there, and whether the system
 * behind the door is up. Static markup apart from the clock and the readiness line, so it renders
 * on the server and is on screen before the session check has answered.
 *
 * On a phone it is a strip across the top with the mark, the clock and the readiness dot; from
 * the medium breakpoint it is a 300px column with the session details and the access line.
 *
 * @returns The panel.
 */
export function DeskPanel(): ReactNode {
  return (
    <aside
      aria-label="Desk"
      className="relative flex shrink-0 items-center gap-4 overflow-hidden border-b border-rule bg-ground px-5 py-3 md:w-[300px] md:flex-col md:items-stretch md:justify-between md:border-r md:border-b-0 md:px-[26px] md:py-7"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[55%] bg-linear-to-b from-beam to-transparent" aria-hidden="true" />

      <div className="relative flex items-center gap-[10px] animate-rise-stagger">
        <BrandMark />
        <div>
          <b className="text-[15px] font-semibold tracking-[-.012em]">Fusion Blotter</b>
          <div className="mt-[2px] hidden font-mono text-[10px] uppercase tracking-[.12em] text-text-2 md:block">Equity cash {'·'} London desk</div>
        </div>
      </div>

      <div className="relative ml-auto flex items-center gap-3 animate-rise-stagger [animation-delay:70ms] md:ml-0 md:flex-col md:items-start md:gap-[6px]">
        <div className="hidden font-mono text-[10px] uppercase tracking-[.12em] text-text-2 md:block">Session clock {'·'} UTC</div>
        <SessionClock className="text-[15px] font-medium text-text md:text-[26px] md:tracking-[-.01em]" />
        <dl className="hidden grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-[10.5px] text-text-2 md:grid">
          <dt>venue</dt>
          <dd className="text-text">LSE, continuous trading</dd>
          <dt>hours</dt>
          <dd className="text-text">08:00 to 16:30 London</dd>
          <dt>desk</dt>
          <dd>
            <DeskReadiness />
          </dd>
        </dl>
        <div className="md:hidden">
          <DeskReadiness compact />
        </div>
      </div>

      <div className="relative hidden animate-rise-stagger [animation-delay:140ms] md:block">
        <div className="mb-[10px] h-px bg-rule" />
        <div className="font-mono text-[10px] uppercase tracking-[.12em] text-text-2">Access issued by the desk head</div>
      </div>
    </aside>
  );
}
