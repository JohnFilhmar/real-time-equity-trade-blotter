import type { ReactNode } from 'react';
import { ThemeToggle } from '@/components/shell/ThemeToggle';
import { DeskPanel } from './DeskPanel';
import { LoginBackdrop } from './LoginBackdrop';

/**
 * The door: the desk panel on one side, the sign-in column on the other, and the theme switch in
 * the corner. Everything here is static and renders on the server; the slot holds whatever the
 * session gate decides to show, so the page is on screen before that decision is made.
 *
 * @param props - The form, or the gate's stand-in for it.
 * @returns The page.
 */
export function LoginStage({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className="relative flex min-h-dvh flex-col md:flex-row">
      <LoginBackdrop />
      <DeskPanel />

      <main className="relative flex flex-1 items-center justify-center px-6 py-10 md:justify-start md:px-16">
        <div className="flex w-full max-w-[330px] flex-col gap-[14px]">
          <div className="animate-rise-stagger [animation-delay:70ms]">
            <h1 className="text-display-sm font-semibold text-text">Sign in</h1>
            <p className="mt-2 text-[12.5px] leading-[1.6] text-text-2">
              Desk credentials. Your trader code stamps every trade you book, amend or cancel.
            </p>
          </div>

          {children}

          <div className="mt-2 flex justify-end md:absolute md:top-5 md:right-5 md:mt-0">
            <ThemeToggle />
          </div>
        </div>
      </main>
    </div>
  );
}
