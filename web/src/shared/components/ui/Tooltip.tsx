import React from 'react';
import { cn } from '@/core/utils/cn';

export interface TooltipProps {
  children: React.ReactNode;
  content: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
  delayMs?: number;
}

export function Tooltip({
  children,
  content,
  side = 'top',
  className,
  delayMs = 350,
}: TooltipProps) {
  const [open, setOpen] = React.useState(false);
  const timerRef = React.useRef<number | null>(null);
  const wrapperRef = React.useRef<HTMLSpanElement>(null);
  const [isTouchDevice, setIsTouchDevice] = React.useState(false);

  // Detect if this is a touch device
  React.useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  function clearTimer() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function handleEnter() {
    if (!isTouchDevice) {
      clearTimer();
      timerRef.current = window.setTimeout(() => {
        setOpen(true);
        timerRef.current = null;
      }, delayMs);
    }
  }

  function handleLeave() {
    if (!isTouchDevice) {
      clearTimer();
      setOpen(false);
    }
  }

  // Handle touch/click for mobile devices
  function handleClick(e: React.MouseEvent) {
    if (isTouchDevice) {
      // Stop propagation to prevent input field from receiving the click
      e.stopPropagation();
      e.preventDefault();
      setOpen((prev) => !prev);
    }
  }

  // Close tooltip when clicking outside
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('touchstart', handleClickOutside);
      };
    }
  }, [open]);

  React.useEffect(() => () => clearTimer(), []);

  const sideClasses = {
    top: 'bottom-full right-0 mb-2',
    bottom: 'top-full right-0 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  } as const;

  const arrowBase = 'absolute w-0 h-0 border-6 border-transparent';
  const arrowBySide = {
    top: 'top-full right-2 -mt-[2px] border-t-[var(--tooltip-bg)]',
    bottom: 'bottom-full right-2 -mb-[2px] border-b-[var(--tooltip-bg)]',
    left: 'left-full top-1/2 -translate-y-1/2 -ml-[2px] border-l-[var(--tooltip-bg)]',
    right: 'right-full top-1/2 -translate-y-1/2 -mr-[2px] border-r-[var(--tooltip-bg)]',
  } as const;

  return (
    <span
      ref={wrapperRef}
      className={isTouchDevice ? 'relative inline-flex cursor-pointer' : 'relative inline-flex'}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onFocus={handleEnter}
      onBlur={handleLeave}
      onClick={handleClick}
      role={isTouchDevice ? 'button' : undefined}
      tabIndex={isTouchDevice ? 0 : undefined}
    >
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute z-50 w-max max-w-[200px] rounded-md px-2 py-1 text-xs break-words whitespace-normal shadow-md transition-opacity duration-150',
          open ? 'opacity-100' : 'opacity-0',
          sideClasses[side],
          className,
        )}
        style={{ backgroundColor: 'var(--tooltip-bg)', color: 'var(--tooltip-text)' }}
      >
        {content}
        <span className={cn(arrowBase, arrowBySide[side])} />
      </span>
    </span>
  );
}

Tooltip.displayName = 'Tooltip';
