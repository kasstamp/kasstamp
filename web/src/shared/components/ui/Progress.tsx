import * as React from 'react';
import { cn } from '@/core/utils/cn';

export function Progress({
  value,
  className,
  ...props
}: { value?: number } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-gray-200', className)}
      {...props}
    >
      <div
        className="h-full bg-emerald-600 transition-all"
        style={{ width: `${Math.min(100, Math.max(0, value ?? 0))}%` }}
      />
    </div>
  );
}
