import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/core/utils/cn';
import React from 'react';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium cursor-pointer transition-colors focus-visible:outline focus-visible:outline-2 disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed active:translate-y-[0px] focus-visible:outline-emerald-600',
  {
    variants: {
      variant: {
        default:
          'bg-[var(--surface-control)] text-[color:var(--text-strong)] hover:bg-[var(--surface-control)] active:bg-[var(--surface-control)]',
        outline:
          'border border-[var(--background-outline)] bg-[var(--surface-control)] text-[color:var(--text-strong)] hover:bg-[var(--surface-control)] active:bg-[var(--surface-control)] hover:border-[var(--background-outline)]',
        ghost:
          'bg-transparent text-[color:var(--text-strong)] hover:bg-[var(--surface-control)] active:bg-[var(--surface-control)]',
      },
      size: {
        default: 'h-9 rounded-3xl px-4 py-2',
        sm: 'h-8 rounded-3xl px-3',
        lg: 'h-10 rounded-3xl px-6',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props} />
    );
  },
);
Button.displayName = 'Button';
