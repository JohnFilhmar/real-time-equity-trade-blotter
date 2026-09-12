'use client';

import type { ReactNode } from 'react';
import { useTheme, type ThemeMode } from '@/providers/theme_provider';

const modes: Array<{ mode: ThemeMode; label: string }> = [
  { mode: 'system', label: 'System' },
  { mode: 'dark', label: 'Dark' },
  { mode: 'light', label: 'Light' },
];

/**
 * The three-way theme switch: follow the OS, or pin dark or light.
 *
 * @returns A segmented control.
 */
export function ThemeToggle(): ReactNode {
  const { mode, set_mode } = useTheme();

  return (
    <div role="group" aria-label="Theme" className="flex gap-[2px] rounded-[8px] border border-rule bg-glass-soft p-[2px]">
      {modes.map((item) => (
        <button
          key={item.mode}
          type="button"
          aria-pressed={mode === item.mode}
          onClick={() => set_mode(item.mode)}
          className={`min-h-[26px] rounded-[6px] px-[9px] font-mono text-[10px] font-medium uppercase tracking-[.08em] transition-colors ${
            mode === item.mode ? 'bg-brand-bg text-brand-lo shadow-[inset_0_0_0_1px_var(--brand_edge)]' : 'text-muted hover:text-text-2'
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
