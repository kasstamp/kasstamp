import * as DialogPrimitive from '@radix-ui/react-dialog';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/core/utils/cn';
import { X } from 'lucide-react';

export function Dialog({
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Root>) {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // On mobile: Ensure document can scroll when dialog opens
  React.useEffect(() => {
    if (isMobile && props.open) {
      // Make sure body is scrollable
      document.body.style.overflow = 'auto';
      document.body.style.position = 'static';
      document.documentElement.style.overflow = 'auto';

      return () => {
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.documentElement.style.overflow = '';
      };
    }
  }, [isMobile, props.open]);

  // On mobile, set modal=false to prevent scroll locking
  return (
    <DialogPrimitive.Root {...props} modal={!isMobile}>
      {children}
    </DialogPrimitive.Root>
  );
}
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  title,
  subtitle,
  alignTop,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  title?: string;
  subtitle?: string;
  alignTop?: boolean;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | 'auto'>('auto');
  const [suppressHeightTransition, setSuppressHeightTransition] = useState(true);
  const rafIdRef = useRef<number | null>(null);

  const calculateHeight = () => {
    if (contentRef.current) {
      // Add padding (p-8 = 32px top + 32px bottom = 64px total)
      const newHeight = contentRef.current.scrollHeight + 64;
      setHeight(newHeight);
    }
  };

  useLayoutEffect(() => {
    if (contentRef.current) {
      // Calculate initial height immediately
      calculateHeight();

      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          // Add padding (p-8 = 32px top + 32px bottom = 64px total)
          const newHeight = entry.contentRect.height + 64;
          setHeight(newHeight);
        }
      });

      resizeObserver.observe(contentRef.current);

      return () => {
        resizeObserver.disconnect();
      };
    }
  }, [children]);

  // Recalculate height when children change
  useEffect(() => {
    // Use a small delay to ensure DOM is updated
    const timeoutId = setTimeout(calculateHeight, 0);
    return () => clearTimeout(timeoutId);
  }, [children]);

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // On mobile, extend overlay height to enable scrolling and maintain blur
  useEffect(() => {
    if (isMobile) {
      const updateOverlayHeight = () => {
        const customOverlay = document.querySelector('.custom-mobile-overlay') as HTMLElement;
        const dialog = document.querySelector('.dialog-top') as HTMLElement;

        if (customOverlay && dialog) {
          // Calculate total height needed: dialog offset + dialog height + extra padding
          const dialogRect = dialog.getBoundingClientRect();
          const dialogTop = dialog.offsetTop || 50;
          const totalHeight = dialogTop + dialogRect.height + 100;

          // Set overlay to cover entire scrollable area (at least the dialog + padding)
          const finalHeight = Math.max(totalHeight, window.innerHeight * 1.5);
          customOverlay.style.height = `${finalHeight}px`;
          customOverlay.style.minHeight = `${finalHeight}px`;
        }
      };

      // Initial update
      updateOverlayHeight();

      // Update on a slight delay to ensure dialog is rendered
      const timeoutId = setTimeout(updateOverlayHeight, 100);

      return () => clearTimeout(timeoutId);
    }
  }, [children, isMobile]);

  return (
    <DialogPrimitive.Portal>
      {/* Custom overlay for mobile */}
      {isMobile && (
        <div
          className="custom-mobile-overlay"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw',
            height: '100vh',
            zIndex: 100,
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            backgroundColor: 'color-mix(in srgb, var(--background-shadow) 70%, transparent)',
            pointerEvents: 'none',
          }}
        />
      )}
      {/* Radix overlay for desktop */}
      {!isMobile && <DialogPrimitive.Overlay className="dialog-overlay" />}
      <DialogPrimitive.Content
        {...props}
        onOpenAutoFocus={(e) => {
          props.onOpenAutoFocus?.(e);
          // Suppress height transition on each open
          setSuppressHeightTransition(true);
          calculateHeight();
          if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = requestAnimationFrame(() => {
            setSuppressHeightTransition(false);
          });
        }}
        className={cn(alignTop ? 'dialog-top dialog-content' : 'dialog dialog-content', className)}
        style={{
          transform: alignTop ? 'translate(-50%, 0)' : 'translate(-50%, -50%)',
          height: typeof height === 'number' ? `${height}px` : 'auto',
          transition: suppressHeightTransition ? 'none' : undefined,
        }}
      >
        <div ref={contentRef}>
          {(title || subtitle) && (
            <DialogHeader className="relative mb-3 flex items-center justify-center pb-2">
              <div className="flex flex-col pr-8 text-center">
                {title && <DialogTitle>{title}</DialogTitle>}
                {subtitle && <DialogDescription className="mt-0">{subtitle}</DialogDescription>}
                {/* Hidden description for accessibility when no subtitle is provided */}
                {title && !subtitle && (
                  <DialogDescription className="sr-only">{title}</DialogDescription>
                )}
              </div>
              <DialogPrimitive.Close className="dialog-close absolute top-0 right-0">
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </DialogPrimitive.Close>
            </DialogHeader>
          )}
          {children}
        </div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-bold text-[color:var(--text-strong)] sm:text-2xl', className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

export const DialogHeader = (props: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col text-center sm:text-left', props.className)} {...props} />
);

export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-[color:var(--text)]', className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;
