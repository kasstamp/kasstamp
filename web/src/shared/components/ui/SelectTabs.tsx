import React from 'react';
import { cn } from '@/core/utils/cn';

export interface SelectTabsOption {
  value: string | number;
  label: string;
}

export interface SelectTabsProps {
  options: SelectTabsOption[];
  value: string | number;
  onChange: (value: string | number) => void;
  className?: string;
  disabled?: boolean;
}

export const SelectTabs = React.forwardRef<HTMLDivElement, SelectTabsProps>(
  ({ options, value, onChange, className, disabled }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'inline-flex h-10 w-full items-center justify-center rounded-md border p-1',
          className,
        )}
        style={{
          backgroundColor: 'var(--background)',
          color: 'var(--text)',
          borderColor: 'var(--background-outline)',
        }}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => !disabled && onChange(option.value)}
            disabled={disabled}
            className={cn(
              'inline-flex flex-1 items-center justify-center rounded-sm px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-all',
              'focus-visible:outline-none',
              'disabled:pointer-events-none disabled:opacity-50',
              // Inactive state: no border or outline
              'bg-transparent text-[color:var(--text)] hover:bg-[var(--surface-control)]',
              // Active state (better visibility with theme vars) incl. focus ring
              value === option.value &&
                'border border-[color:var(--primary)] bg-[var(--surface-control)] text-[color:var(--text-strong)] shadow focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-0',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    );
  },
);

SelectTabs.displayName = 'SelectTabs';
