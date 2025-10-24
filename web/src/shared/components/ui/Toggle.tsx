import React from 'react';
import { cn } from '@/core/utils/cn';

export type ToggleSize = 'sm' | 'md';

export interface ToggleProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'prefix'> {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label?: React.ReactNode;
  prefix?: React.ReactNode;
  size?: ToggleSize;
}

export const Toggle = React.forwardRef<HTMLButtonElement, ToggleProps>(
  (
    {
      checked: controlledChecked,
      defaultChecked,
      onCheckedChange,
      label,
      prefix,
      size = 'md',
      className,
      disabled,
      ...props
    },
    ref,
  ) => {
    const [uncontrolledChecked, setUncontrolledChecked] = React.useState<boolean>(!!defaultChecked);
    const isControlled = controlledChecked !== undefined;
    const checked = isControlled ? !!controlledChecked : uncontrolledChecked;

    function setChecked(next: boolean) {
      if (!isControlled) setUncontrolledChecked(next);
      onCheckedChange?.(next);
    }

    const sizes = {
      sm: {
        track: 'h-5 w-9',
        thumbSize: 'h-4 w-4',
        thumbTranslate: checked ? 'translate-x-5' : 'translate-x-1',
        gap: 'gap-2',
        text: 'text-xs',
        padding: 'px-2 py-1',
      },
      md: {
        track: 'h-6 w-11',
        thumbSize: 'h-5 w-5',
        thumbTranslate: checked ? 'translate-x-6' : 'translate-x-1',
        gap: 'gap-2',
        text: 'text-sm',
        padding: 'px-3 py-2',
      },
    } as const;

    const s = sizes[size];

    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => setChecked(!checked)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setChecked(!checked);
          }
        }}
        className={cn(
          'flex items-center rounded-full font-medium transition-colors focus:outline-none',
          s.padding,
          s.gap,
          s.text,
          disabled && 'cursor-not-allowed opacity-50',
          className,
        )}
        {...props}
      >
        {prefix && (
          <span className="inline-flex items-center text-[color:var(--text)]">{prefix}</span>
        )}
        {label && (
          <span className={cn(s.text, 'font-medium text-[color:var(--text-contrast)]')}>
            {label}
          </span>
        )}
        <div className={cn('toggle relative', s.track, checked && 'toggle--on')}>
          <span
            className={cn(
              'toggle-indicator inline-block rounded-full transition-transform duration-200',
              s.thumbSize,
              s.thumbTranslate,
            )}
          />
        </div>
      </button>
    );
  },
);

Toggle.displayName = 'Toggle';
