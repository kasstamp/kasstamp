import * as React from 'react';
import { cn } from '@/core/utils/cn';
import { Lock, Unlock, Info } from 'lucide-react';
import { Tooltip } from './Tooltip';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  passwordToggle?: boolean;
  tooltipContent?: React.ReactNode;
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right';
  tooltipAriaLabel?: string;
  showTooltipIcon?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      type,
      passwordToggle,
      tooltipContent,
      tooltipSide = 'top',
      tooltipAriaLabel,
      showTooltipIcon = true,
      ...props
    },
    ref,
  ) => {
    const [show, setShow] = React.useState(false);
    const [isMobile, setIsMobile] = React.useState(false);

    // Detect mobile to disable floating labels (iOS Safari cursor bug)
    React.useEffect(() => {
      setIsMobile('ontouchstart' in window || navigator.maxTouchPoints > 0);
    }, []);

    const hasFloating =
      !isMobile && typeof props.placeholder === 'string' && props.placeholder.length > 0;
    const hasTooltip = Boolean(tooltipContent);

    if (type === 'password' && passwordToggle) {
      return (
        <div className={cn('input-wrapper relative', hasFloating && 'has-floating')}>
          <input
            type={show ? 'text' : 'password'}
            className={cn(
              'peer input-field password-field',
              hasTooltip && !isMobile ? 'pr-16' : 'pr-10',
              className,
            )}
            ref={ref}
            placeholder={hasFloating ? ' ' : props.placeholder}
            {...props}
          />
          {hasFloating && <label className="input-label">{props.placeholder}</label>}
          {hasTooltip && showTooltipIcon && !isMobile && (
            <span className="absolute top-1/2 right-3 -translate-y-1/2 text-[color:var(--text)]">
              <Tooltip content={tooltipContent} side={tooltipSide}>
                <Info className="h-4 w-4" aria-label={tooltipAriaLabel} />
              </Tooltip>
            </span>
          )}
          <span
            className={cn(
              'absolute top-1/2 -translate-y-1/2',
              hasTooltip && !isMobile ? 'right-8' : 'right-2',
            )}
          >
            <button
              type="button"
              aria-label={show ? 'Hide password' : 'Show password'}
              onClick={() => setShow((v) => !v)}
              className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded border-0 bg-transparent text-[color:var(--text)] outline-0 transition-colors"
            >
              {show ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            </button>
          </span>
        </div>
      );
    }

    if (hasFloating || hasTooltip) {
      return (
        <div className={cn('input-wrapper relative', hasFloating && 'has-floating')}>
          <input
            type={type}
            className={cn('peer input-field', hasTooltip && !isMobile && 'pr-10', className)}
            ref={ref}
            placeholder={hasFloating ? ' ' : props.placeholder}
            {...props}
          />
          {hasFloating && <label className="input-label">{props.placeholder}</label>}
          {hasTooltip && showTooltipIcon && !isMobile && (
            <span className="absolute top-1/2 right-3 -translate-y-1/2 text-[color:var(--text)]">
              <Tooltip content={tooltipContent} side={tooltipSide}>
                <Info className="h-4 w-4" aria-label={tooltipAriaLabel} />
              </Tooltip>
            </span>
          )}
        </div>
      );
    }

    return <input type={type} className={cn(className)} ref={ref} {...props} />;
  },
);
Input.displayName = 'Input';
