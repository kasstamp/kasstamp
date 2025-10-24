import React from 'react';
import { cn } from '@/core/utils/cn';
import { ChevronDown } from 'lucide-react';

export interface FaqItemProps {
  question: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

export function FaqItem({ question, children, defaultOpen, className }: FaqItemProps) {
  const [open, setOpen] = React.useState(!!defaultOpen);
  return (
    <div className={cn('w-full min-w-0', className)}>
      <button
        type="button"
        className={cn(
          'flex w-full min-w-0 items-center justify-between gap-3 py-3 text-left font-medium md:py-4',
        )}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="min-w-0 flex-1">{question}</span>
        <ChevronDown
          className={cn(
            'h-4 w-4 flex-shrink-0 transition-transform',
            open ? 'rotate-180' : 'rotate-0',
          )}
        />
      </button>
      {open && (
        <div
          className="w-full min-w-0 pt-2 pb-3 md:pb-4"
          style={{ color: 'var(--text-secondary)' }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

FaqItem.displayName = 'FaqItem';
